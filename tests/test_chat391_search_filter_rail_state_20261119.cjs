'use strict';
// CHAT-391 regression: observable transitions, not only source tokens.
// No real messages, database writes, PWA requests or notifications.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const dir=fs.readFileSync('contact-directory-admin.js','utf8');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const policy=fs.readFileSync('shell-form-viewport-policy.js','utf8');
new vm.Script(dir);
const start=dir.indexOf("  const input=tools.querySelector('[data-contact-directory-search]');");
const end=dir.indexOf("  for(const button of tools.querySelectorAll('[data-contact-directory-filter]')){",start);
assert(start>0&&end>start,'extract the single search controller');
class ElementMock{
  constructor(){this.dataset={};this.listeners=new Map();this.attributes={};this.hidden=false;}
  addEventListener(type,callback){const list=this.listeners.get(type)||[];list.push(callback);this.listeners.set(type,list);}
  emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  closest(){return null;}
}
const input=new ElementMock();
input.value='';
input.offsetWidth=44;
const field=new ElementMock();
field.dataset.expanded='false';
const toggle=new ElementMock();
const cancel=new ElementMock();cancel.hidden=true;
field.querySelector=key=>key.includes('cancel')?cancel:key.includes('toggle')?toggle:null;
input.closest=()=>field;
const layer=new ElementMock();
layer.dataset.mobileKeyboard='false';
const nav=new ElementMock();
nav.scrollTop=260;nav.isConnected=true;
const host=new ElementMock();
host.isConnected=true;
host.closest=selector=>selector==='.wm-sidebar-navigation'?nav:null;
const tools={querySelector:key=>key.includes('data-contact-directory-search')?input:null};
const document={
  activeElement:null,
  getElementById:id=>id==='shellNavigationLayer'?layer:null,
  querySelector:selector=>selector==='[data-v21-contact-list]'?host:null
};
let captureCount=0,restoreCount=0;
const window={
  V21DirectoryViewport:{
    capture:(scroller,list)=>{assert.equal(scroller,nav);assert.equal(list,host);captureCount++;return{id:'contact-before-search',top:260};},
    restore:(scroller,list,anchor)=>{assert.equal(anchor.id,'contact-before-search');restoreCount++;scroller.scrollTop=anchor.top;}
  }
};
input.focus=()=>{document.activeElement=input;input.emit('focus');};
input.blur=()=>{if(document.activeElement===input){document.activeElement=null;input.emit('blur');}};
let keyboardCallback=null;
class MutationObserverMock{
  constructor(callback){keyboardCallback=callback;}
  observe(){}
  disconnect(){}
}
const pending=[];
let syncCount=0;
const syncArgs=[];
const scope={
  tools,nav,document,window,Element:ElementMock,MutationObserver:MutationObserverMock,
  mobileDirectoryHeaderVisible:()=>true,
  syncDirectoryRows:opts=>{
    syncCount++;syncArgs.push({...opts});
    if(opts?.scrollToTop)nav.scrollTop=0;
  },
  queueMicrotask:fn=>pending.push(fn),
  resetDirectorySearchMode:null,directoryKeyboardObserver:null,query:''
};
vm.runInNewContext(dir.slice(start,end),scope);
function flush(){while(pending.length)pending.shift()();}
assert.equal(field.dataset.expanded,'false');
toggle.emit('click');
assert.equal(field.dataset.expanded,'true');
assert.equal(layer.dataset.directorySearchActive,'true');
assert.equal(document.activeElement,input);
assert.equal(captureCount,1,'capture the original directory scroll once');
// Blank search must collapse and restore the filters on blur.
input.blur();
assert.equal(field.dataset.expanded,'false');
assert.equal(layer.dataset.directorySearchActive,'false');
assert.equal(cancel.hidden,true);
assert.equal(restoreCount,1,'close with an empty search restores directory');
assert.equal(nav.scrollTop,260);
// Native iOS Done may close IME without an input blur.
toggle.emit('click');
layer.dataset.mobileKeyboard='true';keyboardCallback();
layer.dataset.mobileKeyboard='false';keyboardCallback();
assert.equal(field.dataset.expanded,'false');
assert.equal(layer.dataset.directorySearchActive,'false');
// Typed query remains visible while browsing results after keyboard closes.
toggle.emit('click');
input.value='sam';input.emit('input');
assert.equal(nav.scrollTop,0,'search results begin at the first match');
assert(syncArgs.some(options=>options.scrollToTop===true && options.reorder===false),
  'query changes must reset the result list only');
input.value='sam p';input.emit('input');
assert.equal(captureCount,3,'input changes do not recapture the original anchor');
input.blur();
assert.equal(field.dataset.expanded,'true');
assert.equal(layer.dataset.directorySearchActive,'false');
assert.equal(cancel.hidden,false);
cancel.emit('click');
assert.equal(field.dataset.expanded,'false');
assert.equal(input.value,'');
assert.equal(nav.scrollTop,260,'cancel restores the exact original scroll anchor');
assert.equal(restoreCount,3,'all three finished search sessions restore');
// Touching a result must not reflow the row between pointerdown and click.
toggle.emit('click');
input.value='quyen';input.emit('input');
const result=new ElementMock();
result.closest=selector=>selector==='[data-contact-select]'?result:null;
nav.emit('pointerdown',{target:result});
input.blur();
assert.equal(field.dataset.expanded,'true');
nav.emit('click',{target:result});
flush();
assert.equal(field.dataset.expanded,'false');
assert(syncCount>=3,'search reset delivered to original directory store');
assert.equal(nav.scrollTop,260,'contact selection does not lose the former directory anchor');
assert.equal(restoreCount,4);
assert(css.includes('grid-template-areas:"filters search" "results results"'),
  'compact search shares filter row instead of reserving bottom dock');
assert(css.includes('grid-template-areas:"search" "results"'),
  'typing mode puts the search at top and results in remaining height');
assert(css.includes(':has(.contact-directory-search-field[data-expanded="true"])'),
  'expanded mode uses the original search input at full width');
assert(policy.includes("activeOwner.host.dataset.mobileKeyboard='true'"),
  'platform remains sole keyboard owner');
// CHAT-392: geometry/typography contract for the iPhone screenshot.
const designStart=css.indexOf('/* CHAT-388 — ONE mobile directory layout owner (389/390/391/392 compatible).');
const designEnd=css.indexOf('/* CHAT-AXIS-',designStart);
assert(designStart>=0&&designEnd>designStart,'one last mobile directory owner');
const design=css.slice(designStart,designEnd);
for(const token of [
  '.top-mode-switch[data-directory-owner="true"]',
  'grid-template-columns:minmax(0,1fr) 52px;',
  'grid-template-areas:"filters search" "results results";',
  'grid-template-areas:"search" "filters" "results";',
  'grid-template-areas:"search" "results";',
  'grid-area:results;',
  'overflow-y:auto;',
  'min-height:72px!important;',
  'grid-template-columns:minmax(0,1fr) 60px;',
  'font-size:15px!important;',
  'font-size:13px!important;',
  'font-size:11px!important;',
  'min-height:44px;',
  '.contact-directory-search-field[data-expanded="true"]'
])assert(design.includes(token),'CHAT-392 visual owner lost '+token);
assert.equal((design.match(/grid-area:results;/g)||[]).length,1,
  'one directory list scroll owner');
assert(!design.includes('position:fixed'),
  'no second floating toolbar or keyboard overlay');

console.log('CHAT-391 search/filter rail and blur/IME/result-click transitions PASS');
