'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const first=source.indexOf('// Composer focus is the textarea\'s native responsibility.');
const last=source.indexOf('/* =========================================================\n   IME + SEND',first);
assert(first>0&&last>first,'composer focus runtime owner changed');
const piece=source.slice(first,last);
assert(piece.includes('recoverComposerFocusFromScrollOverlap'),'overlap recovery missing');
class Node {
  constructor(parent=null){this.parent=parent;this.listeners={};this.dataset={};this.actionable=false;}
  contains(node){for(let p=node;p;p=p.parent)if(p===this)return true;return false;}
  closest(){return this.actionable?this:null;}
  addEventListener(name,callback){this.listeners[name]=callback;}
  hasAttribute(name){return name==='inert'&&Boolean(this.inert);}
}
const stage=new Node(),scrollRoot=new Node(stage),message=new Node(scrollRoot),
    action=new Node(scrollRoot),miscOverlay=new Node(stage),
    interactive=new Node(stage),shell=new Node(interactive),wrap=new Node(shell),
    inner=new Node(wrap),editor=new Node(wrap),scrollControl=new Node(stage);
editor.isConnected=true;editor.disabled=false;editor.readOnly=false;
editor.focusCalls=0;editor.focus=function(){this.focusCalls++};
wrap.getBoundingClientRect=()=>({left:100,top:100,right:400,bottom:170,width:300,height:70});
const appShell={dataset:{route:'chat'}},host=new Node();
const controller={mode:'NONE',snapshot(){return {mode:this.mode}}};
const doc={listeners:{},addEventListener(n,fn){this.listeners[n]=fn;},
  getElementById(n){return n==='threadScrollControlWrap'?scrollControl:null;}};
vm.runInNewContext(piece,{
  editor,editorWrap:wrap,composerShell:shell,composerInteractive:interactive,
  appShell,screenHost:host,InteractionController:controller,
  InteractionMode:{NONE:'NONE'},document:doc,scrollRoot,Element:Node,Number
});
assert.equal(typeof shell.listeners.pointerdown,'function');
assert.equal(typeof doc.listeners.pointerdown,'function');
function ev(target,x=200,y=125){return{target,clientX:x,clientY:y,
  button:0,isPrimary:true,cancelable:true,prevented:false,
  preventDefault(){this.prevented=true}}}
const padding=ev(wrap);shell.listeners.pointerdown(padding);
assert.equal(editor.focusCalls,1,'empty composer padding focuses editor');
const nested=ev(inner);shell.listeners.pointerdown(nested);
assert.equal(editor.focusCalls,2,'passive child inside text region focuses editor');
const native=ev(editor);shell.listeners.pointerdown(native);
assert.equal(editor.focusCalls,2,'native textarea must keep browser caret');
const buttonInside=new Node(wrap);buttonInside.actionable=true;
shell.listeners.pointerdown(ev(buttonInside));
assert.equal(editor.focusCalls,2,'real buttons must not steal focus');
const overlapped=ev(message);doc.listeners.pointerdown(overlapped);
assert.equal(editor.focusCalls,3,'noninteractive scroll overlay recovers editor focus');
assert.equal(overlapped.prevented,true,'blocked text-region hit must not select message below');
const outside=ev(message,20,20);doc.listeners.pointerdown(outside);
assert.equal(editor.focusCalls,3,'outside text region keeps original scroll/tap behavior');
action.actionable=true;const btn=ev(action);
doc.listeners.pointerdown(btn);assert.equal(editor.focusCalls,3);
assert.equal(btn.prevented,false,'clickable content is never hijacked');
doc.listeners.pointerdown(ev(miscOverlay));
assert.equal(editor.focusCalls,3,'unrelated overlay is not hijacked');
appShell.dataset.route='work';doc.listeners.pointerdown(ev(message));
assert.equal(editor.focusCalls,3,'Work route does not steal focus');
appShell.dataset.route='chat';host.inert=true;
doc.listeners.pointerdown(ev(message));assert.equal(editor.focusCalls,3,'locked modal respects inert');
host.inert=false;controller.mode='IMAGE_VIEWER';
doc.listeners.pointerdown(ev(message));assert.equal(editor.focusCalls,3,'image viewer lock is respected');
controller.mode='NONE';shell.dataset.audioState='RECORDING';
doc.listeners.pointerdown(ev(message));assert.equal(editor.focusCalls,3,'recording mode is respected');
shell.dataset.audioState='IDLE';editor.disabled=true;
doc.listeners.pointerdown(ev(message));assert.equal(editor.focusCalls,3,'disabled input untouched');
console.log('PASS composer text focus recovery: padding, native caret, overlap, button, modal, Work, audio, disabled');
