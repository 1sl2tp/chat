'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const js=fs.readFileSync('shell-form-viewport-policy.js','utf8');
const css=fs.readFileSync('zalo-admin-link.css','utf8');

class Style{
  constructor(){this.data=new Map()}
  setProperty(k,v){this.data.set(k,String(v))}
  removeProperty(k){this.data.delete(k)}
  getPropertyValue(k){return this.data.get(k)||''}
}
function node({cls='',rect={top:0,bottom:300},parent=null,field=false}={}){
  const n={className:cls,parentElement:parent,dataset:{},style:new Style(),
    scrollTop:0,rect,isField:field,
    getBoundingClientRect(){return{...this.rect}},
    matches(sel){return sel==='input,textarea,select,[contenteditable="true"]'&&this.isField},
    closest(sel){
      const wanted=sel.split(',').map(part=>part.trim());
      let e=this;
      while(e){
        if(wanted.some(part=>{
          if(part==='.zalo-account-submodal > .zalo-account-panel')
            return e.className==='zalo-account-panel' && e.parentElement?.className==='zalo-account-submodal';
          return part.startsWith('.') && e.className===part.slice(1);
        }))return e;
        e=e.parentElement;
      }
      return null;
    },
    querySelector(){return null}
  };
  return n;
}
const modal=node({cls:'zalo-account-modal',rect:{top:0,bottom:375}});
const card=node({cls:'zalo-account-card',parent:modal,rect:{top:8,bottom:368}});
const preferences=node({cls:'zalo-account-preferences',parent:card,rect:{top:70,bottom:170}});
const list=node({cls:'zalo-account-list',parent:card,rect:{top:200,bottom:350}});
const search=node({parent:list,field:true,rect:{top:345,bottom:390}});
const prefsInput=node({parent:preferences,field:true,rect:{top:162,bottom:200}});
const inner=node({cls:'zalo-account-submodal',parent:modal,rect:{top:0,bottom:375}});
const panel=node({cls:'zalo-account-panel',parent:inner,rect:{top:8,bottom:368}});
const panelField=node({parent:panel,field:true,rect:{top:345,bottom:405}});
const listeners={};let activeElement=null;
const document={get activeElement(){return activeElement},addEventListener(type,fn){listeners[type]=fn}};
const vvListeners={};
const viewport={height:720,offsetTop:0,addEventListener(type,fn){vvListeners[type]=fn}};
const queue=[];
const raf=fn=>{queue.push(fn);return queue.length};
function flush(){
  for(let guard=0;queue.length && guard<12;guard++){
    for(const cb of queue.splice(0))cb();
  }
  assert.equal(queue.length,0,'animation frame processing must finish');
}
const windowObj={
  innerHeight:720,visualViewport:viewport,
  navigator:{maxTouchPoints:5,userAgent:'iPhone'},
  matchMedia:()=>({matches:true}),
  addEventListener(){}
};
vm.runInNewContext(js,{
  document,window:windowObj,navigator:windowObj.navigator,
  requestAnimationFrame:raf,Math,Number,String,Boolean,Object,Array,Map,Set,Date,console
});
const owner=windowObj.V21ShellFormViewportPolicy;
assert.ok(owner);
assert.match(js,/SPEC-CHAT-SETTINGS-IOS-KEYBOARD-20261101/);
assert.match(css,/SPEC-CHAT-SETTINGS-IOS-KEYBOARD-20261101/);
assert.match(css,/\.zalo-account-modal\[data-mobile-keyboard="true"\]/);
assert.match(css,/height:var\(--shell-form-vv-height,100svh\)/);
assert.match(css,/\.zalo-account-submodal\[data-mobile-keyboard="true"\]>.zalo-account-panel/);

function focus(field){
  activeElement=field;
  listeners.focusin({target:field});
  flush();
}
focus(search);
viewport.height=360;viewport.offsetTop=13;
vvListeners.resize();flush();
assert.equal(modal.dataset.mobileKeyboard,'true');
assert.equal(card.dataset.mobileKeyboard,'true');
assert.equal(modal.style.getPropertyValue('--shell-form-vv-height'),'360px');
assert.equal(modal.style.getPropertyValue('--shell-form-vv-top'),'13px');
assert.equal(card.style.getPropertyValue('--shell-form-keyboard-inset'),'360px');
assert(list.scrollTop>0,'focused account-search field must scroll its own directory');
assert.equal(card.scrollTop,0,'outer clipped card must not be forced to scroll');
assert.equal(owner.snapshot().kind,'account-settings');

focus(prefsInput);
assert(preferences.scrollTop>0,'preferences field should remain reachable without moving the directory');
assert.equal(modal.dataset.mobileKeyboard,'true');

focus(panelField);
assert.equal(inner.dataset.mobileKeyboard,'true','nested picker gets its own measured keyboard surface');
assert.equal(panel.dataset.mobileKeyboard,'true');
assert(panel.scrollTop>0,'picker scrolls its own panel');
assert.equal(modal.dataset.mobileKeyboard,undefined,'previous owner is cleared on switch');
assert.equal(owner.snapshot().kind,'account-settings-panel');

viewport.height=720;viewport.offsetTop=0;
vvListeners.resize();flush();
assert.equal(inner.dataset.mobileKeyboard,undefined);
assert.equal(panel.dataset.mobileKeyboard,undefined);
assert.equal(inner.style.getPropertyValue('--shell-form-vv-height'),'720px');

activeElement=null;
listeners.focusout();
flush();
assert.equal(owner.snapshot().active,false);
assert.equal(inner.style.getPropertyValue('--shell-form-vv-height'),'');
assert.equal(inner.style.getPropertyValue('--shell-form-vv-top'),'');
assert.equal(panel.style.getPropertyValue('--shell-form-keyboard-inset'),'');
console.log('CHAT-SETTINGS-KEYBOARD-20261101 iOS visual viewport + scoped form scrolling PASS');
