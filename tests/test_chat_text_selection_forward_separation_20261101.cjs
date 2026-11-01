'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// SPEC-CHAT-TEXT-SELECTION-VS-FORWARD-20261101
// GIVEN a mobile text message, WHEN holding and dragging native text
// selection, THEN the Chat action/Forward toolbar must not open.
// WHEN tapping the distinct 44px more-actions control, THEN the Chat
// actions open, toggle and include the existing Copy/Forward capabilities.
// MUST-STAY: message identity, reply, media longpress, forwarding rules,
// and desktop hover/keyboard action rail.
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('index.source.html','utf8');

assert(!app.includes('bindTurnActionTap(turn,text);'),
  'text longpress must never claim native selection');
assert(!app.includes('bindTurnActionTap(node,text);'),
  'rerendered text must not re-enable conflicting longpress');
assert(app.includes('bindTurnActionTap(turn,mediaShell);'),
  'media longpress remains available');
assert(app.includes('bindTurnActionTap(node,mediaShell);'),
  'reconciled media retains existing longpress');
assert(app.includes('ensureTurnActionsTrigger(turn,unit);'));
assert(app.includes('ensureTurnActionsTrigger(node,unit);'));
assert(app.includes("label:'Chuyển tiếp',icon:'forward'"));
assert(app.includes("window.V21MessageForward?.open?.(resolveMessage())"));
assert(app.includes("label:'Sao chép',icon:'copy'"));
assert(css.includes('.message-text{\n  -webkit-user-select:text;\n  user-select:text;'));
assert(css.includes('.message-actions-trigger{display:none}'),
  'desktop must retain hover/keyboard controls without duplicate button');
assert(css.includes('.message-actions-trigger{\n    position:absolute;'));
assert(css.includes('width:44px;\n    height:44px;'));
assert(css.includes('user-select:none;'));
assert(css.includes('.user-message-unit>.message-actions-trigger{right:calc(100% + 2px)}'));
assert(css.includes('.assistant-message-unit>.message-actions-trigger{left:calc(100% + 2px)}'));

const start=app.indexOf('function ensureTurnActionsTrigger(turn,unit){');
const end=app.indexOf('\nfunction bindTurnActionTap(turn,target){',start);
assert(start>0 && end>start);
const implementation=app.slice(start,end);
const button={
  type:'',className:'',textContent:'',attributes:{},listeners:{},
  setAttribute(k,v){this.attributes[k]=v},
  addEventListener(name,callback){this.listeners[name]=callback}
};
const turn={};
const unit={
  attached:[],
  querySelector(selector){
    assert.equal(selector,':scope > .message-actions-trigger');
    return this.attached[0]||null;
  },
  appendChild(node){this.attached.push(node)}
};
let toggles=0;
const ctx={
  document:{createElement(tag){assert.equal(tag,'button');return button}},
  toggleActionsForTurn(turnArg){assert.equal(turnArg,turn);toggles++}
};
vm.runInNewContext(implementation,ctx);
const trigger=ctx.ensureTurnActionsTrigger(turn,unit);
assert.equal(trigger,button);
assert.equal(trigger.className,'message-actions-trigger');
assert.equal(trigger.attributes['aria-label'],'Mở thao tác tin nhắn');
assert.equal(trigger.attributes['aria-expanded'],'false');
assert.equal(ctx.ensureTurnActionsTrigger(turn,unit),trigger);
assert.equal(unit.attached.length,1,'reuse trigger when a message is patched');

let prevented=0,stopped=0;
const interaction={preventDefault(){prevented++},stopPropagation(){stopped++}};
trigger.listeners.pointerdown(interaction);
assert.equal(stopped,1);
assert.equal(toggles,0,'touch start alone must not open forwarding');
trigger.listeners.click(interaction);
assert.equal(toggles,1,'explicit tap opens the action menu');
assert.equal(prevented,1);

const open=app.slice(app.indexOf('function toggleActionsForTurn(turn,force){'),app.indexOf('\nfunction bindTurnActionTap(turn,target){'));
assert(open.includes("trigger.setAttribute('aria-expanded',next?'true':'false')"));
assert(app.includes("turn.querySelector('.message-actions-trigger')?.setAttribute('aria-expanded','false')"));
// When a native highlight begins while the explicit menu is already open,
// dismiss the Chat rail rather than covering the copy/lookup handles.
const selectionStart=app.indexOf("document.addEventListener('selectionchange',()=>{");
const selectionEnd=app.indexOf('\nfunction toggleActionsForTurn(turn,force){',selectionStart);
assert(selectionStart>0&&selectionEnd>selectionStart);
let selectionHandler=null,railCloses=0;
let selection={isCollapsed:true,anchorNode:null};
vm.runInNewContext(app.slice(selectionStart,selectionEnd),{
  window:{getSelection:()=>selection},
  document:{addEventListener:(type,handler)=>{
    assert.equal(type,'selectionchange');
    selectionHandler=handler;
  }},
  closeAllTurnActions:()=>{railCloses++}
});
selectionHandler();
assert.equal(railCloses,0,'no highlighted text must leave actions unchanged');
selection={isCollapsed:false,anchorNode:{nodeType:3,parentElement:{
  closest:selector=>selector==='.message-text'?{}:null
}}};
selectionHandler();
assert.equal(railCloses,1,'native text highlight closes an overlapping Chat action menu');

console.log('CHAT native text selection and explicit Forward/Copy actions are separate PASS');
