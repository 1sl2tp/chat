'use strict';
// SPEC-CHAT-FORWARD-IOS-KEYBOARD-20261105
// The share dialog recipient search is a pinned header, not a scroll target:
// both iOS PWA and mobile Web must keep it above the software keyboard.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const policy=fs.readFileSync(path.join(root,'shell-form-viewport-policy.js'),'utf8');
const css=fs.readFileSync(path.join(root,'message-forward.css'),'utf8');
const forward=fs.readFileSync(path.join(root,'message-forward.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.source.html'),'utf8');
assert.match(forward,/class="message-forward-search"/);
assert.match(forward,/input\?\.focus\(\{preventScroll:true\}\)/);
assert.match(html,/data-build-source="message-forward.css"/);
assert.match(html,/data-build-source="shell-form-viewport-policy.js"/);
assert.match(policy,/kind:'message-forward',surface:forwardCard,host/);
assert.match(policy,/owner.kind==='directory'\|\|owner.kind==='message-forward'/);
assert.match(css,/\.message-forward-overlay\[data-mobile-keyboard="true"\]/);
assert.match(css,/top:var\(--shell-form-vv-top,0px\)/);
assert.match(css,/height:var\(--shell-form-vv-height,100svh\)/);
assert.match(css,/\.message-forward-overlay\[data-mobile-keyboard="true"\] \.message-forward-list\{[\s\S]*?min-height:0;[\s\S]*?overflow-y:auto;/);
assert.match(css,/\.message-forward-overlay\[data-mobile-keyboard="true"\] \.message-forward-search\{[\s\S]*?font-size:16px;/);

class Style{
  constructor(){this.props=new Map();this.writes=[];}
  getPropertyValue(k){return this.props.get(k)||'';}
  setProperty(k,v){this.props.set(k,String(v));this.writes.push([k,String(v)]);}
  removeProperty(k){this.props.delete(k);}
}
function makeNode({className='',parent=null,field=false,rect={top:0,bottom:780}}={}){
  return{
    className,parentElement:parent,dataset:{},style:new Style(),scrollTop:0,
    rect,scrollHeight:600,clientHeight:300,
    matches(sel){return field&&sel==='input,textarea,select,[contenteditable="true"]';},
    getBoundingClientRect(){return this.rect;},
    closest(sel){
      for(let n=this;n;n=n.parentElement){
        if(sel.startsWith('.')&&sel.slice(1)===n.className)return n;
      }
      return null;
    },
    querySelector(){return null;}
  };
}
const overlay=makeNode({className:'message-forward-overlay',rect:{top:0,bottom:800}});
const card=makeNode({className:'message-forward-card',parent:overlay,rect:{top:300,bottom:800}});
const search=makeNode({className:'message-forward-search',parent:card,field:true,rect:{top:400,bottom:445}});
const resultList=makeNode({className:'message-forward-list',parent:card});
const otherField=makeNode({field:true});

const listeners={},viewListeners={},frames=[];
let activeElement=null;
const vv={height:800,offsetTop:0,addEventListener(type,fn){viewListeners[type]=fn;}};
const document={get activeElement(){return activeElement;},addEventListener(type,fn){listeners[type]=fn;}};
const window={visualViewport:vv,innerHeight:800,navigator:{maxTouchPoints:5,userAgent:'iPhone'},
  matchMedia:()=>({matches:false}),addEventListener(){}};
const ctx={window,document,navigator:window.navigator,Math,Number,Boolean,String,
  Object,Array,Map,Set,Date,console,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;}};
vm.createContext(ctx);
vm.runInContext(policy,ctx,{timeout:3000});
const owner=window.V21ShellFormViewportPolicy;
assert.ok(owner);
function flush(){
  let turns=0;
  while(frames.length){
    assert(++turns<12,'viewport owner never settles');
    for(const fn of frames.splice(0))fn();
  }
}
activeElement=search;
listeners.focusin({target:search});flush();
assert.equal(owner.snapshot().kind,'message-forward');
assert.equal(overlay.dataset.mobileKeyboard,undefined,'closed keyboard must preserve normal sheet');

vv.height=350;vv.offsetTop=12;
viewListeners.resize();flush();
assert.equal(overlay.dataset.mobileKeyboard,'true');
assert.equal(card.dataset.mobileKeyboard,'true');
assert.equal(overlay.style.getPropertyValue('--shell-form-vv-top'),'12px');
assert.equal(overlay.style.getPropertyValue('--shell-form-vv-height'),'350px');
assert.equal(card.style.getPropertyValue('--shell-form-vv-height'),'350px');
assert.equal(card.style.getPropertyValue('--shell-form-keyboard-inset'),'450px');
assert.equal(card.scrollTop,0,'pinned recipient search does not scroll sheet behind keyboard');
resultList.scrollTop=120;
const previous=resultList.scrollTop;
for(let i=0;i<12;i++)viewListeners.scroll();
flush();
assert.equal(card.scrollTop,0,'repeated iOS keyboard events must not scroll the pinned input');
assert.equal(resultList.scrollTop,previous,'visible result-list scroll position stays under user control');

vv.height=800;vv.offsetTop=0;
viewListeners.resize();flush();
assert.equal(overlay.dataset.mobileKeyboard,undefined,'sheet must restore after keyboard close');
assert.equal(card.dataset.mobileKeyboard,undefined);

vv.height=350;vv.offsetTop=12;
viewListeners.resize();flush();
assert.equal(overlay.dataset.mobileKeyboard,'true','keyboard reopen reactivates same owner');
activeElement=otherField;
listeners.focusout();flush();
assert.equal(owner.snapshot().active,false);
assert.equal(overlay.dataset.mobileKeyboard,undefined);
assert.equal(overlay.style.getPropertyValue('--shell-form-vv-top'),'');
assert.equal(overlay.style.getPropertyValue('--shell-form-vv-height'),'');
assert.equal(card.style.getPropertyValue('--shell-form-keyboard-inset'),'');
console.log('CHAT iOS PWA forward share/search VisualViewport + keyboard recovery PASS');
