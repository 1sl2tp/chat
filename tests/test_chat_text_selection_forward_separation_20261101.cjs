'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// SPEC-CHAT-TEXT-SELECTION-VS-FORWARD-20261101
// GIVEN a mobile text message, WHEN holding and dragging native text
// selection, THEN the Chat action/Forward toolbar must not open.
// WHEN tapping the text bubble briefly, THEN the Chat actions open.
// No decorative ellipsis is shown; Copy/Forward remains available.
// MUST-STAY: message identity, reply, media longpress, forwarding rules,
// and desktop hover/keyboard action rail.
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('index.source.html','utf8');

assert(!app.includes('bindTurnActionTap(turn,text);'),
  'native mobile text selection must not use the Chat longpress timer');
assert(!app.includes('bindTurnActionTap(node,text);'));
assert(app.includes('bindTurnActionTap(turn,mediaShell);'));
assert(app.includes('bindTurnActionTap(node,mediaShell);'));
assert(app.includes('bindTextActionTap(turn,text);'));
assert(app.includes('bindTextActionTap(node,text);'));
assert(!app.includes('ensureTurnActionsTrigger('));
assert(!app.includes("button.textContent='⋯'"));
assert(app.includes("label:'Chuyển tiếp',icon:'forward'"));
assert(app.includes("window.V21MessageForward?.open?.(resolveMessage())"));
assert(app.includes("label:'Sao chép',icon:'copy'"));
assert(css.includes('.message-text{\n  -webkit-user-select:text;\n  user-select:text;'));
assert(css.includes('.message-actions-trigger{display:none!important}'));
assert(!css.includes('.message-actions-trigger{\n    position:absolute;'),
  'no floating 44px ellipsis in touch layout');
const start=app.indexOf('function bindTextActionTap(turn,text){');
const end=app.indexOf('\nfunction bindTurnActionTap(turn,target){',start);
assert(start>0&&end>start);
const implementation=app.slice(start,end);
const listeners={};
const textNode={dataset:{},tabIndex:-1,addEventListener:(type,fn)=>{listeners[type]=fn}};
const turn={dataset:{}};
let toggles=0;
const ctx={
  Date:{now:()=>1000},
  window:{matchMedia:()=>({matches:true}),getSelection:()=>({isCollapsed:true})},
  toggleActionsForTurn:(arg)=>{assert.equal(arg,turn);toggles++}
};
vm.runInNewContext(implementation,ctx);
ctx.bindTextActionTap(turn,textNode);
assert.equal(textNode.tabIndex,0);
ctx.bindTextActionTap(turn,textNode);
assert.equal(Object.keys(listeners).filter(v=>v==='click').length,1);
const evt={target:{closest:()=>null},pointerType:'touch',clientX:2,clientY:2};
listeners.pointerdown(evt);
listeners.click(evt);
assert.equal(toggles,1,'a short tap opens the existing action group');
listeners.pointerdown(evt);
listeners.pointermove({...evt,clientX:80});
listeners.click(evt);
assert.equal(toggles,1,'dragging must not open actions');
listeners.pointerdown(evt);
listeners.click({...evt,target:{closest:()=>({})}});
assert.equal(toggles,1,'links and reply controls keep their own action');
ctx.window.getSelection=()=>({isCollapsed:false});
listeners.click(evt);
assert.equal(toggles,1,'highlighted text retains browser selection');
listeners.keydown({target:textNode,key:'Enter',preventDefault(){}});
assert.equal(toggles,2,'keyboard can open the same toolbar');
assert(app.includes("turn.dataset.actionsPlacement=(above<54&&below>=54)?'below':'above';"));
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
