'use strict';
// CHAT-340/345: pending keeps no layout row; feedback is a subtle text/media pulse.
// This test never sends a real message or creates a network request.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const begin=app.indexOf('function syncMessageDeliveryState(');
const end=app.indexOf('function messageDateKey(',begin);
assert(begin>0&&end>begin);
const runtime=app.slice(begin,end);
const marker='/* CHAT-345: ChatGPT-like quiet pending feedback.';
const css=source.slice(source.indexOf(marker),source.indexOf('.user-message-unit{',source.indexOf(marker)));
assert(css.startsWith(marker),'the new low-contrast pending feedback is the source owner');
assert(css.includes('.message-delivery-state[data-state="sending"]{'));
for(const key of ['position:absolute!important;','width:1px!important;','height:1px!important;','clip-path:inset(50%)!important;']){
  assert(css.includes(key),'pending status must not affect scroll/Composer height: '+key);
}
assert(css.includes('chat-send-text-breathe 2.5s ease-in-out infinite'),'pending text uses a gentle color animation');
assert(css.includes('chat-send-media-breathe 2.5s ease-in-out infinite'),'pending media has a tiny dot pulse');
assert(css.includes('pointer-events:none;'),'the media marker never blocks image controls');
assert(css.includes('width:7px;')&&css.includes('height:7px;'),'small media indicator');
assert(!css.includes('conic-gradient('),'no rotating ring');
assert(!css.includes('chat-send-border-orbit'),'old border animation removed');
assert(css.includes('@media(prefers-reduced-motion:reduce)'));
assert(css.includes('animation:none!important;'),'reduced motion is respected');
assert(!css.includes('position:fixed'),'the border never takes the viewport');

function node(tag='div'){
 return{
  tag,className:'',dataset:{},attributes:{},children:[],isConnected:true,_text:'',
  get textContent(){return this._text;},
  set textContent(v){this._text=String(v);this.children=[];},
  setAttribute(k,v){this.attributes[k]=String(v);},
  appendChild(child){child.parent=this;this.children.push(child);return child;},
  querySelector(sel){
   return sel===':scope > .message-delivery-state'
    ?this.children.find(x=>x.className==='message-delivery-state')||null:null;
  },
  addEventListener(){},
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
 };
}
const ctx=vm.createContext({document:{createElement:node},
 // This legacy baseline verifies reduced-motion immediate ACK cleanup.
 // Normal-motion finish-current-cycle is separately checked by CHAT-341.
 window:{matchMedia:()=>({matches:true})}});
vm.runInContext(runtime+'\nglobalThis.renderStatus=syncMessageDeliveryState;',ctx);
const me=node(),other=node();
ctx.renderStatus(me,{sender:'self',status:'sending',media:{type:'image'}});
assert.equal(me.dataset.deliveryState,'sending');
assert.equal(me.children.length,1,'one accessible status, never visible separate row');
assert.equal(me.children[0].attributes.role,'status');
assert.equal(me.children[0].textContent,'Đang chờ xác nhận gửi');
assert.equal(me.children[0].dataset.state,'sending');
ctx.renderStatus(other,{sender:'remote',status:'sending'});
assert.equal(other.children.length,0,'incoming messages must not inherit local pending style');
assert.equal(other.dataset.deliveryState,undefined);
ctx.renderStatus(me,{sender:'self',status:'failed',media:null});
assert.equal(me.dataset.deliveryState,'failed');
assert.equal(me.children[0].dataset.state,'failed');
assert.equal(me.children[0].textContent,'Chưa gửi thành công');
ctx.renderStatus(me,{sender:'self',status:'sent'});
assert.equal(me.dataset.deliveryState,undefined,'ACK removes all pending feedback');
assert.equal(me.children.length,0,'ACK removes accessible pending status');
assert(app.includes("message?.status==='sending'?'Tạo lúc '"));
assert(app.includes("status:'sending'"),'optimistic state still exists');
assert(app.includes("unit.dataset.deliveryState='sending';"),'media retry reuses pending pulse');
assert(app.includes("retryFailedMedia?.("),'durable retry remains available');
// CHAT-345's quiet pending state remains required, and later releases must
// rotate the public shell epoch without invalidating this old feature test.
assert(/const SHELL_CACHE_EPOCH='pwa-chat-[a-z0-9-]+';/.test(sw),
 'a versioned Web/PWA shell must ship the visual');
assert(!sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-send-border-chat340-20261113';"),
 'the release epoch must advance beyond the CHAT-340 build');
console.log('CHAT-340/345 baseline: hidden pending status, real ACK cleanup and subtle text/media indicator PASS');
