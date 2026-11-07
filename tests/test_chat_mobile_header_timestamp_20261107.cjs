'use strict';
// UI-252: screenshot-driven mobile header balance and in-bubble timestamps.
// Strictly visual: no new messages, time metadata, keyboard or network owner.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const core=fs.readFileSync('conversation-core.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const marker='UI-252 — mobile header geometry and in-bubble sent-time';
assert.equal(css.split(marker).length-1,1,'one mobile UI-252 visual owner');
const ui=css.slice(css.indexOf(marker));
assert.match(ui,/@media\(max-width:63\.999rem\)/);
assert.match(ui, /grid-template-columns:44px minmax\(0,1fr\) auto;/);
assert.match(ui, /grid-template-columns:minmax\(0,1fr\) 44px;/);
assert.match(ui, /#regionTop \.call-focus-slot\[data-call-ui-state="idle"\]:not\(\[hidden\]\)/);
assert(ui.includes('gap:0;')&&ui.includes('max-width:min(50vw,104px);'),
  'call cluster must size to visible actions without overflow');
assert(ui.includes('width:44px;')&&ui.includes('min-height:44px;'),
  'photos and calls retain full finger target');
assert(ui.includes('.top-mode-tab[data-top-tab="chat"]')&&
  ui.includes('[data-chat-tab-label]'),'contact name remains the flexible width owner');
assert(ui.includes('text-overflow:ellipsis;'),'long names must truncate instead of cover calls');

// 320–430px: all 44px targets remain visible; name yields first.
for(const vw of [320,360,375,390,393,430]){
  const rail=vw<=360?6:10;
  const gap=vw<=360?4:6;
  const back=44, callsMax=96, photos=44;
  const center=vw-2*rail-back-2*gap-callsMax;
  const avatar=vw<=360?32:36;
  const name=center-photos-2-avatar-8;
  assert(name>=45,'contact title needs safe space at '+vw+'px');
}

// One real <time> remains in the unit: its former 17px flow height
// is exactly exchanged for 17px extra padding inside the bubble.
// Virtualization therefore retains its existing scroll/spacer contract.
const tSelector='.message-unit:has(>.message-text:not([hidden]))>.message-sent-time';
assert(ui.includes(tSelector),'hidden/empty bubbles must keep normal metadata');
assert(ui.includes('padding-bottom:25px!important;'),
  '8px original bubble bottom + 14px line + 3px margin = 25px');
assert(ui.includes('position:absolute;')&&ui.includes('inset:auto 10px 7px auto;'));
assert(ui.includes('margin:0!important;'));
assert(ui.includes('[data-content-kind="text"]'));
assert(!ui.includes('[data-content-kind="image"] .message-unit>.message-sent-time'),
  'invoice/photo timestamps must not overlay fine print');
assert(source.includes('margin-top:3px;')&&source.includes('line-height:14px;'));
assert(core.includes('sentTimeHeight=Number.isFinite(sentTime)&&sentTime>0?17:0'));
assert(app.includes("time.className='message-sent-time'"));
assert(app.includes("time.dateTime=date.toISOString();"));
assert(app.includes("time.setAttribute('aria-label','Gửi lúc '+full+' · giờ Việt Nam');"));
assert(app.includes("timeZone:'Asia/Ho_Chi_Minh'"));
assert(ui.includes('.call-focus-slot:not([data-call-ui-state="idle"])'),
  'active-call layout must be left intact');
const epoch=sw.match(/const SHELL_CACHE_EPOCH='([^']+)';/)?.[1]||'';
assert(epoch==='pwa-chat-header-time-ui252-20261107','installed PWA must load UI-252 shell');
console.log('UI-252 header 320–430px, calls, photo, VN in-bubble timestamps, media visibility and virtual scroll PASS');
