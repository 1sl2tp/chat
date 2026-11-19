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
const tools={querySelector:key=>key.includes('data-contact-directory-search')?input:null};
const document={activeElement:null,getElementById:id=>id==='shellNavigationLayer'?layer:null};
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
const scope={
  tools,nav,document,Element:ElementMock,MutationObserver:MutationObserverMock,
  mobileDirectoryHeaderVisible:()=>true,
  syncDirectoryRows:()=>{syncCount++;},
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
// Blank search must collapse and restore the filters on blur.
input.blur();
assert.equal(field.dataset.expanded,'false');
assert.equal(layer.dataset.directorySearchActive,'false');
assert.equal(cancel.hidden,true);
// Native iOS Done may close IME without an input blur.
toggle.emit('click');
layer.dataset.mobileKeyboard='true';keyboardCallback();
layer.dataset.mobileKeyboard='false';keyboardCallback();
assert.equal(field.dataset.expanded,'false');
assert.equal(layer.dataset.directorySearchActive,'false');
// Typed query remains visible while browsing results after keyboard closes.
toggle.emit('click');
input.value='sam';input.emit('input');
input.blur();
assert.equal(field.dataset.expanded,'true');
assert.equal(layer.dataset.directorySearchActive,'false');
assert.equal(cancel.hidden,false);
cancel.emit('click');
assert.equal(field.dataset.expanded,'false');
assert.equal(input.value,'');
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
assert(css.includes('grid-template-areas:"filters search" "results results"'),
  'compact search shares filter row instead of reserving bottom dock');
assert(css.includes('grid-template-areas:"results" "search"'),
  'typing mode gives results remaining visible height');
assert(css.includes(':has(.contact-directory-search-field[data-expanded="true"])'),
  'expanded mode has a full-width dock');
assert(policy.includes("activeOwner.host.dataset.mobileKeyboard='true'"),
  'platform remains sole keyboard owner');
console.log('CHAT-391 search/filter rail and blur/IME/result-click transitions PASS');
