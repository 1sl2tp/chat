'use strict';
// CHAT-433 | 2027/V46 composer focus UX adapted to current Chat.
// Static contract: no network, customer data, sending, layout or state edits.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('chatgpt-ab-conversation.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const mobile=fs.readFileSync('mobile-chat-refresh.css','utf8');
const begin=css.indexOf('/* CHAT-433 · 2027/V46 design primitive:');
const finish=css.indexOf('  #composerShell :is(#editorWrap,#composer-mic-btn)',begin);
assert(begin>=0&&finish>begin,'focus remains in composer visual owner');
const block=css.slice(begin,finish);
const sharedPill=css.slice(css.indexOf('/* Mobile Composer:'),begin);
assert(sharedPill.includes('grid-column:2 / 4;')&&sharedPill.includes('grid-row:3;'),
 'stable 4-track mobile composer must remain');
assert(block.includes(':has(#editor:focus-visible)::before'),
 'textarea, not buttons, triggers the focus ring');
assert(!block.includes(':focus-within::before'),
 'plus/mic/send should not draw editor focus');
for(const state of ['REQUESTING_PERMISSION','RECORDING','STOPPING','PREVIEW','SENDING'])
 assert(block.includes(':not([data-audio-state="'+state+'"])'),state);
assert(block.includes('border-color:color-mix('));
assert(block.includes('box-shadow:0 0 0 2px'));
assert(block.includes('@media(forced-colors:active)'));
assert(block.includes('outline:2px solid Highlight'));
assert(!/\b(?:position|top|bottom|left|right|grid-template|transform|scroll-behavior|overflow|padding|margin|height|width)\s*:/.test(block),
 'focus paints only; no geometry or viewport ownership');
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|setInterval|setTimeout)\s*\(/.test(block));
assert(source.includes('id="editor"')&&source.includes('id="composerShell"'));
// CHAT-434: placeholder is not a persistent accessible name; label belongs to P4 editor.
const editorTag=source.match(/<textarea\s+[^>]*\bid="editor"[^>]*>/);
assert(editorTag,'canonical composer textarea remains present');
assert(/\baria-label="Nội dung tin nhắn"/.test(editorTag[0]),
 'screen readers have a stable editor name independent of placeholder visibility');
assert(!/\b(?:autofocus|aria-live|role|tabindex)=/.test(editorTag[0]),
 'accessible name must not alter focus, announcements or keyboard ownership');

assert(source.includes('data-build-source="chatgpt-ab-conversation.css"'));
assert(mobile.includes('grid-template-rows:auto auto minmax(var(--ui-control-touch,44px),auto);'));
console.log('CHAT-433 editor-only focus, contrast and keyboard/scroll ownership: PASS');
