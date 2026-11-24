'use strict';
// CHAT-414: final A/B ChatGPT-like conversation skin regression.
// Static visual contract: no customer messages, network, or database writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('chatgpt-ab-conversation.css','utf8');
const mobile=fs.readFileSync('mobile-chat-refresh.css','utf8');
const app=fs.readFileSync('app.js','utf8');
const htmlTag='<link rel="stylesheet" href="./chatgpt-ab-conversation.css" data-build-source="chatgpt-ab-conversation.css">';
assert(source.includes(htmlTag),'new design must be in canonical build');
assert(source.indexOf(htmlTag)>source.indexOf('data-build-source="mobile-ui-polish.css"'),
 'approved visual rules must load after old two-bubble layers');
assert(css.includes('#stageLayout:not([data-bank-report-active="true"])'),
 'never alter financial reports or other app modules');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({
 selector:selector.replace(/\/\*[\s\S]*?\*\//g,'').trim(),body:body.trim()
}));
function has(selectorPieces,style){
 return rules.some(rule=>selectorPieces.every(s=>rule.selector.includes(s))&&rule.body.includes(style));
}
assert(has(['[data-turn="user"]','.user-message-unit:not([data-shared-list="true"])>.message-text'],
 'background:var(--chat-message-sent-bg)!important'),
 'A must be a single muted gray bubble');
assert(has(['[data-turn="assistant"]','.assistant-message-unit:not([data-shared-list="true"])>.message-text'],
 'background:transparent!important'),
 'B must be plain text, NEVER a second bubble');
assert(has(['[data-turn="assistant"]','.assistant-message-unit:not([data-shared-list="true"])>.message-text'],
 'border-radius:0!important'),
 'B may not keep the old rounded bubble outline');
assert(has(['[data-turn="assistant"]','.assistant-message-unit:not([data-shared-list="true"])'],
 'max-width:min(100%,46rem)!important'),
 'B must get nearly full reading width, not the old 70/86% bubble constraint');
assert(has(['[data-content-kind="text"][data-turn="assistant"]','>.message-sent-time'],
 'inset:auto auto 7px 0!important'),
 'B clock must be small, below-left, without overlaying text');
assert(css.includes(':not([data-shared-list="true"])'),
 'shared sender-neutral item tables must stay independently centered');
assert(css.includes('#messageWindow .message-day-order-wrap .day-order-summary-card'),
 'KH day summaries must remain a separate surface');
assert(css.includes('/* CHAT-444 · iPhone side-by-side reference: ONE parent capsule'),
 'one CRM composer capsule must match the ChatGPT reference');
assert(css.includes('border-radius:999px!important;'),
 'entire plus/editor/mic/send parent owns the single pill');
assert(css.includes('background:var(--cgpt-composer-surface-primary)!important;'),
 'single composer surface must not use disconnected sub-capsules');
assert(!css.includes('grid-column:2 / 4;')&&!css.includes('grid-template-columns:'),
 'CHAT-444 must not create a second painted pill or replace stable grid tracks');
assert(mobile.includes('grid-template-rows:auto auto minmax(var(--ui-control-touch,44px),auto);'),
 'soft keyboard and multiline composer retain their source owner');
assert(!/position\s*:\s*(?:fixed|sticky)|(?:overflow-y|scroll-snap-type|scroll-behavior)\s*:|scrollTop\s*=/.test(css),
 'visual layer may not own scroll/keyboard positioning');
for(const symbol of ['function renderWindow(', 'function appendScrollPolicy(',
  'function syncMessageTimeNode(','function stockSummaryCustomerAllowed('])
 assert(app.includes(symbol),'do not replace existing logic '+symbol);
for(const id of ['id="editor"','id="send"','id="composer-plus-btn"',
 'id="composer-mic-btn"','id="scrollRoot"','id="messageWindow"'])
 assert(source.includes(id),'must keep original interaction target '+id);
console.log('CHAT-414 ChatGPT-like A/B visual contract: PASS');
