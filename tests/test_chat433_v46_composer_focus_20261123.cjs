'use strict';
// CHAT-433 | 2027/V46 composer focus UX adapted to current Chat.
// Static contract: no network, customer data, sending, layout or state edits.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('chatgpt-ab-conversation.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const mobile=fs.readFileSync('mobile-chat-refresh.css','utf8');
const begin=css.indexOf('/* CHAT-444 · iPhone side-by-side reference: ONE parent capsule');
const finish=css.indexOf('  #composerShell :is(#editorWrap,#composer-mic-btn)',begin);
assert(begin>=0&&finish>begin,'focus remains in the single composer visual owner');
const block=css.slice(begin,finish);
assert(block.includes('border-radius:999px!important;'),
 'one outer ComposerShell capsule holds plus, editor, mic and send');
assert(block.includes(':has(#editor:focus-visible){'),
 'textarea, not buttons, triggers the parent capsule focus ring');
assert(!block.includes(':focus-within::before'),
 'plus/mic/send should not draw an editor focus ring');
for(const state of ['REQUESTING_PERMISSION','RECORDING','STOPPING','PREVIEW','SENDING'])
 assert(block.includes(':not([data-audio-state="'+state+'"])'),state);
assert(block.includes('border-color:color-mix('));
assert(block.includes('box-shadow:0 0 0 2px'));
assert(block.includes('@media(forced-colors:active)'));
assert(block.includes('outline:2px solid Highlight'));
const focusOnly=block.slice(block.indexOf(':has(#editor:focus-visible){'),block.indexOf('@media(forced-colors:active)'));
assert(!/\b(?:position|top|bottom|left|right|grid-template|transform|scroll-behavior|overflow|padding|margin|height|width)\s*:/.test(focusOnly),
 'focus paints only; no geometry or viewport ownership');
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|setInterval|setTimeout)\s*\(/.test(block));
assert(source.includes('id="editor"')&&source.includes('id="composerShell"'));
assert(source.includes('data-build-source="chatgpt-ab-conversation.css"'));
assert(mobile.includes('grid-template-rows:auto auto minmax(var(--ui-control-touch,44px),auto);'));
console.log('CHAT-433 editor-only focus, contrast and keyboard/scroll ownership: PASS');

// PA11.4 regression: mobile hint is visually hidden without removing the
// existing composer controls, changing send behavior or adding keyboard owners.
const hintBegin=css.indexOf('/* PA11.4:');
const hintEnd=css.indexOf('  #appShell[data-auth-state="authenticated"][data-route="chat"]\n  #stageLayout:not([data-bank-report-active="true"])\n  #composerShell:not([data-audio-state="REQUESTING_PERMISSION"])',hintBegin);
assert(hintBegin>=0&&hintEnd>hintBegin,'PA11.4 stays in existing mobile composer owner');
const hintBlock=css.slice(hintBegin,hintEnd);
assert(hintBlock.includes('#composerShell #composerHint'));
for(const declaration of ['position:absolute;','inline-size:1px;','block-size:1px;','clip-path:inset(50%);'])
 assert(hintBlock.includes(declaration),declaration);
assert(!/display:\s*none|visibility:\s*hidden/.test(hintBlock),'hint remains in accessibility tree');
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|setInterval|setTimeout)\s*\(/.test(hintBlock));
for(const id of ['composerHint','composer-plus-btn','composer-mic-btn','send','editor'])
 assert(source.includes('id="'+id+'"'),'preserve '+id);
console.log('PA11.4 mobile composer hint, controls and accessibility guard: PASS');
