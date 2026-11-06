'use strict';
// UI-248: send control and actual send transaction must agree for text,
// whitespace-only drafts, IME composition and media-only sends on Web/PWA.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const start=app.indexOf('function canSendFromComposer(){');
const end=app.indexOf('function toggleComposerSendMode(){',start);
assert(start>=0&&end>start,'must use canonical composer eligibility and visual state');
const ctx={
  editor:{value:'',enterKeyHint:'enter'},
  pendingAttachments:[],
  mediaRecorder:null,audioWorkflowState:'IDLE',
  sendLocked:false,composing:false,composerSendMode:'button',
  composerShell:{dataset:{}},
  sendButton:{dataset:{},disabled:false,attributes:{},
    setAttribute(name,value){this.attributes[name]=value;}},
  renderComposerModeHint(){}
};
vm.createContext(ctx);
vm.runInContext(app.slice(start,end)+'\nglobalThis.can=canSendFromComposer;globalThis.sync=syncSendButtonState;',ctx);
const check=(value,mediaCount,eligible)=>{
  ctx.editor.value=value;
  ctx.pendingAttachments=Array.from({length:mediaCount},()=>({kind:'image'}));
  assert.equal(ctx.can(),eligible,'eligibility for '+JSON.stringify(value)+' and '+mediaCount+' media');
  ctx.sync();
  assert.equal(ctx.composerShell.dataset.canSend,String(eligible),'visual send-state parity');
  assert.equal(ctx.sendButton.dataset.modeToggle,String(!eligible),'blank draft is mode toggle');
  assert.equal(ctx.sendButton.disabled,false,'allowed submit or mode toggle remains reachable');
  assert.equal(ctx.sendButton.attributes['aria-disabled'],'false');
  assert.equal(ctx.sendButton.attributes['aria-label'],eligible?'Gửi tin nhắn':'Đổi sang Return gửi');
};
check('',0,false);
check('   ',0,false);
check(' \n \t \u00a0 ',0,false);
check('Xin chào',0,true);
check('  Xin chào  ',0,true);
check('Xin chào\n',0,true);
check(' ',1,true);
check('',1,true);
ctx.editor.value='Chào';
ctx.pendingAttachments=[];
ctx.composing=true;ctx.sync();
assert.equal(ctx.sendButton.disabled,true,'IME must not accidentally submit');
assert.equal(ctx.sendButton.attributes['aria-disabled'],'true');
ctx.composing=false;
ctx.sendLocked=true;ctx.sync();
assert.equal(ctx.sendButton.disabled,true,'in-flight send remains locked');
ctx.sendLocked=false;
ctx.composerSendMode='enter';
ctx.editor.value='   ';ctx.sync();
assert.equal(ctx.editor.enterKeyHint,'send');
assert.equal(ctx.sendButton.attributes['aria-label'],'Đổi sang Return xuống dòng');
assert(app.includes('const text=rawText.trim();'),'send transaction must still trim');
assert(app.includes('if((!text&&pendingAttachments.length===0)||sendLocked||composing)return false;'));
assert(app.includes("composerForm.addEventListener(\n  'submit'"));
assert(app.includes('if(!canSendFromComposer()){'));
assert(html.includes('id="editor"')&&html.includes('id="send" type="submit"'));
const shellEpoch=sw.match(/const SHELL_CACHE_EPOCH='([^']+)';/)?.[1]||'';
assert(shellEpoch.startsWith('pwa-chat-')&&
  !['pwa-chat-directory-chatgpt-polish-ui247-20261106','pwa-chat-composer-send-parity-ui248-20261106'].includes(shellEpoch),
  'later PWA releases must advance the shell epoch without breaking UI-248 send parity');
console.log('UI-248 composer whitespace/IME/media send-state Web/PWA parity PASS');
