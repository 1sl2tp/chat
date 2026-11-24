'use strict';
// CHAT-437 — PA2 geometry on the actual narrow Chrome/Safari/PWA Chat DOM.
// Structural regression only: no messages, credentials, banking, DB or network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');
const token=read('ui-foundation.css');
const refresh=read('mobile-chat-refresh.css');
const directory=read('mobile-ui-polish.css');
const ab=read('chatgpt-ab-conversation.css');
const shell=read('shell.js');
const source=read('index.source.html');
const sw=read('sw.js');
const sourceVersion=source.split('name="app-release-version" content="')[1]?.split('"')[0];
assert(sourceVersion?.startsWith('V21.'),'canonical source release exists');
assert(token.includes('--ui-chat-layout-rail:12px;'));
assert(token.includes('--ui-chat-message-rail:14px;'),
 '12px geometry + 2px optical compensation for rounded edges');
assert(token.includes('--ui-composer-action-gap:8px;'),
 'round controls must not visually touch their neighboring capsule');
const narrow=refresh.slice(refresh.indexOf('/* UI-139/141'),refresh.indexOf('/* UI-268 desktop',refresh.indexOf('/* UI-139/141')));
assert(narrow.includes('@media (max-width:63.999rem)'));
assert(narrow.includes('width:100%!important;')&&narrow.includes('margin-inline:0!important;'));
assert(narrow.includes('max(var(--ui-chat-message-rail,14px),env(safe-area-inset-left,0px))'));
assert(narrow.includes('max(var(--ui-chat-message-rail,14px),env(safe-area-inset-right,0px))!important;'));
assert(narrow.includes('#messageWindow>.message-row[data-turn="assistant"] .assistant-message-unit'));
assert(narrow.includes('margin-inline-start:0!important;'));
assert(narrow.includes('margin-inline-end:0!important;'));
assert(narrow.includes('padding-inline:0!important;'),
 'outer thread owns its single gutter; media/rows do not add a second gutter');
const composer=refresh.slice(refresh.indexOf('/* ChatGPT-like adaptive dock:'),refresh.indexOf('/* UI-142 — On mobile'));
assert(composer.includes('gap:0 var(--ui-composer-action-gap,8px);'));
assert(composer.includes('padding:0 2px 0 10px!important;'));
assert(composer.includes('grid-template-columns:var(--ui-control-touch,44px) minmax(0,1fr) var(--ui-control-touch,44px) var(--ui-control-touch,44px)'));
assert(composer.includes('grid-template-rows:auto auto minmax(var(--ui-control-touch,44px),auto)'));
for(const id of ['#composer-plus-btn','#composer-mic-btn','#send','#editor']){
 assert(composer.includes(id),id);
}
assert(composer.includes('font-size:var(--ui-input-mobile-font-size,16px)'));
assert(refresh.includes('[data-keyboard-open="true"]'),'existing keyboard contract retained');
const a=directory.indexOf('/* CHAT-388 — ONE mobile directory layout owner');
const b=directory.indexOf('/* CHAT-AXIS-',a);
assert(a>=0&&b>a);
const dir=directory.slice(a,b);
assert.equal(directory.split('/* CHAT-388 — ONE mobile directory layout owner').length-1,1);
assert(dir.includes('min-height:64px!important;'));
assert.equal((dir.match(/min-height:64px!important;/g)||[]).length,2,
 'row and hitbox share same 64px height');
assert(dir.includes('padding:0 10px max(12px,env(safe-area-inset-bottom,0px))!important;'));
assert(dir.includes('grid-template-columns:minmax(0,1fr) 58px;'));
assert(dir.includes('grid-area:results;')&&dir.includes('overflow-y:auto;'));
assert(!dir.includes('position:fixed'),'no competing scroll/keyboard owner');
assert(ab.includes('B / remote: genuine unboxed text'));
assert(ab.includes('border-radius:24px!important;'));
assert(ab.includes('/* CHAT-444 · iPhone side-by-side reference: ONE parent capsule'),
 'single ChatGPT-like input capsule replaces nested input painting');
assert(ab.includes('border-radius:999px!important;'),
 'composer optical edge belongs to the ComposerShell parent');
assert(ab.includes(':has(#editor:focus-visible){'),
 'the single capsule uses editor-only focus, not duplicate surface');
assert(sourceVersion?.startsWith('V21.'));
assert(sw.includes("RELEASE_VERSION='"+sourceVersion+"'"));
assert(sw.includes("SHELL_CACHE_EPOCH='pwa-chat-"),'PWA cache epoch exists');
assert(shell.includes('const WORK_ENABLED=false;'),'Work remains dormant');
for(const w of [320,360,390,500]){
 const inputWidth=w-24-8-(44*3)-(8*3);
 assert(inputWidth>=120,'composer text track at '+w+'px must remain usable');
}
console.log('CHAT-437 narrow screenshots: symmetric rail, optically inset composer, 64px directory, keyboard and private caches unchanged PASS');
