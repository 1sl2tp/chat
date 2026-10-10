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
const editor={isConnected:true,disabled:false,readOnly:false,focusCalls:[],focus(opts){this.focusCalls.push(opts);}};
const editorWrap={node:'padding'};
const composerShell={node:'shell',dataset:{audioState:'IDLE'}};
const ctx={editor,editorWrap,composerShell};
vm.createContext(ctx);
vm.runInContext(functionBody+';globalThis.focusPadding=focusEditorFromComposerPadding',ctx);
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
