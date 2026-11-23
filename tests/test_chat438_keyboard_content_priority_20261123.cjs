'use strict';
// CHAT-438 — Mobile keyboard leaves the conversation and composer as the
// two primary working regions. Structural regression only: NEVER send a
// message, invoke an OCR worker, alter a bank ledger or simulate a payment.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const refresh=fs.readFileSync('mobile-chat-refresh.css','utf8');
const marker='/* CHAT-438 / 2027 parent';
const start=css.indexOf(marker);
assert(start>0,'CHAT-438 belongs to existing quick-action CSS owner');
const section=css.slice(start,css.indexOf('/* Compact conversations:',start));
assert(section.includes('#stageLayout[data-keyboard-open="true"]:not([data-bank-report-active="true"]) #chatQuickActions:not([hidden])'));
assert(section.includes('display:none!important;'),'keyboard-open quick actions must yield their 52px');
assert(!/position\s*:|height\s*:|overflow\s*:|scroll-behavior|transform\s*:/.test(section),
 'a presentational mode must not compete with keyboard, scroll or layout owners');
assert.equal((css.match(/CHAT-438 \/ 2027 parent/g)||[]).length,1,
 'do not add cascade patches for the same keyboard interaction');
const owner=css.slice(css.indexOf('/* Four business actions'),start);
assert(owner.includes('min-height:52px;'),'unchanged normal-state quick-action rail');
assert(owner.includes('#chatQuickActions>button'),'real quick-action controls are retained');
assert(source.includes('id="chatQuickActions"'),'toolbar stays in DOM to restore after keyboard close');
assert(source.includes('id="editor"'),'textarea stays in original Composer');
assert(source.includes('id="scrollRoot"'),'one conversation scroll owner retained');
assert(refresh.includes('#stageLayout[data-keyboard-open="true"] #threadScrollControlWrap'),
 'existing keyboard layout remains its owner');
assert(source.includes('<meta name="app-release-version" content="V21.72.77">'));
assert(sw.includes("RELEASE_VERSION='V21.72.77'"));
assert(sw.includes("SHELL_CACHE_EPOCH='pwa-chat-ui438-keyboard-reading-priority-20261123'"));
assert(!section.includes('fetch(')&&!section.includes('rpc('));
console.log('CHAT-438 keyboard reading-priority layout: PASS (mobile only, no new owner)');
