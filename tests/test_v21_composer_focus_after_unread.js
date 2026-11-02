const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'..','index.source.html'),'utf8');
const start=app.indexOf('function focusEditorFromComposerPadding(event){');
const stop=app.indexOf("\ncomposerShell.addEventListener('pointerdown',focusEditorFromComposerPadding);",start);
assert(start>=0&&stop>start,'canonical Composer padding focus owner not found');
const functionBody=app.slice(start,stop);
const guardStart=app.indexOf('function composerEditorCanFocus(){');
assert(guardStart>=0&&guardStart<start,'shared Composer focus lease owner must precede padding handler');
const guardBody=app.slice(guardStart,start);
const editor={isConnected:true,disabled:false,readOnly:false,focusCalls:[],focus(opts){this.focusCalls.push(opts);}};
const editorWrap={node:'padding'};
const composerShell={node:'shell',dataset:{audioState:'IDLE'}};
const appShell={dataset:{route:'chat'}};
const screenHost={inert:false,hasAttribute(name){return name==='inert'&&this.inert;}};
const interaction={mode:'NONE',snapshot(){return{mode:this.mode}}};
const ctx={
  editor,editorWrap,composerShell,appShell,screenHost,
  InteractionController:interaction,InteractionMode:{NONE:'NONE'}
};
vm.createContext(ctx);
vm.runInContext(guardBody+functionBody+';globalThis.focusPadding=focusEditorFromComposerPadding',ctx);
assert.equal(ctx.focusPadding({target:editorWrap}),true);
assert.equal(ctx.focusPadding({target:composerShell}),true);
assert.equal(editor.focusCalls.length,2);
for(const opt of editor.focusCalls)assert.equal(opt.preventScroll,true);
assert.equal(ctx.focusPadding({target:editor}),false,'native textarea click owns caret');
assert.equal(ctx.focusPadding({target:{node:'button'}}),false,'toolbar button must not be hijacked');
assert.equal(editor.focusCalls.length,2,'only empty padding may delegate focus');
composerShell.dataset.audioState='RECORDING';
assert.equal(ctx.focusPadding({target:editorWrap}),false,'recording must not open keyboard');
composerShell.dataset.audioState='IDLE';
editor.disabled=true;
assert.equal(ctx.focusPadding({target:editorWrap}),false,'disabled input stays disabled');
editor.disabled=false;
appShell.dataset.route='work';
assert.equal(ctx.focusPadding({target:editorWrap}),false,'Work route must not summon Chat keyboard');
appShell.dataset.route='chat';
screenHost.inert=true;
assert.equal(ctx.focusPadding({target:editorWrap}),false,'inert screen must block Composer padding focus');
screenHost.inert=false;
interaction.mode='CALL_RINGING';
assert.equal(ctx.focusPadding({target:editorWrap}),false,'incoming call must not summon keyboard');
interaction.mode='NONE';
assert.equal(ctx.focusPadding({target:editorWrap}),true,'Composer becomes focusable after call ends');
assert.equal(editor.focusCalls.length,3);
assert(!functionBody.includes('preventDefault('));
assert(!functionBody.includes('scrollToTail('));
assert(!functionBody.includes('selectionStart'));
assert(!functionBody.includes('selectionEnd'));
for(const piece of [
  '#threadScrollControlWrap{\n  z-index:0;\n  pointer-events:none;',
  '#threadScrollControl{\n  pointer-events:none;',
  '#stageLayout[data-scroll-from-end]:not([data-contact-switching="true"]) #threadScrollControl{\n  pointer-events:auto;',
  '#composerInteractive{\n  z-index:2;\n  pointer-events:auto;',
  '#composerShell,#editorWrap,#editor{\n  pointer-events:auto;'
])assert(source.includes(piece),'pointer hit-test contract missing: '+piece);
assert(source.includes('placeholder="Nhắn tin..."'));
assert(source.includes('class="threadFooterContentFade z-10 isolate w-full basis-auto pointer-events-none flex flex-col"'));
assert(source.includes('class="pointer-events-auto relative z-[1] flex w-full flex-col"'));
console.log('Chat composer after-unread focus/hit-test contract PASS');
