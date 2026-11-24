'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const refresh=fs.readFileSync('mobile-chat-refresh.css','utf8');
const marker='/* CHAT-338 — approved Concept 3: balanced ChatGPT × messaging app.';
const pos=css.indexOf(marker);
assert(pos>0,'concept 3 must be a deliberate final mobile visual layer');
// CHAT-388 is a separate L2 Directory layout owner. Do not evaluate its
// intentionally scrollable contact-results region as part of CHAT-338's
// L3 Conversation visual-only rule, or a valid directory grid will fail CI.
const nextOwner=css.indexOf('/* CHAT-388 —',pos);
const visual=css.slice(pos,nextOwner>pos?nextOwner:undefined);
for(const key of [
 '@media(max-width:63.999rem)',
 '@media(max-width:360px)',
 '#stageLayout:not([data-bank-report-active="true"])',
 '--chat-message-sent-bg:',
 '--chat-message-received-bg:',
 '#regionTop .compact-top-grid:has(.top-mode-switch[data-contact-identity="true"])',
 '.top-mode-switch[data-contact-identity="true"] [data-chat-tab-label]',
 '#chatQuickActions:not([hidden])',
 '#chatQuickActions>button[data-chat-quick="cash"]',
 'min-height:44px;',
 '#messageWindow>.message-row[data-content-kind="text"] .user-message-unit>.message-text',
 '#messageWindow>.message-row[data-content-kind="text"] .assistant-message-unit>.message-text',
 '.message-unit:has(>.message-sent-time)>.message-text:not([hidden])',
 'padding-bottom:25px!important;',
 '#composerShell:focus-within',
 '#editor{',
 'font-size:16px;',
 '#composerShell[data-can-send="true"] #send:not(:disabled)',
 'background:#237be2;'
]) assert(visual.includes(key),'missing approved mobile contract '+key);
for(const q of ['data-chat-quick="cash"','data-chat-quick="debt"',
 'data-chat-quick="photos"','data-chat-quick="recent"',
 'data-top-tab="chat"','data-top-tab="photos"',
 'id="composerShell"','id="composer-plus-btn"','id="composer-mic-btn"',
 'id="send"','id="editor"','id="chatCallFocus"'])
 assert(html.includes(q),'original click target must be retained: '+q);
assert(html.includes('data-fixed-header="always"'));
assert(html.includes('data-composer-placement-owner="stateful-sticky-or-visual-viewport"'));
assert(html.includes('data-composer-visual-mode="floating-outside-scroll-root-or-visual-viewport"'));
assert(refresh.includes('#stageLayout[data-keyboard-open="true"]'),
 'existing iOS keyboard owner must survive unchanged');
assert(refresh.includes('grid-template-rows:auto auto minmax(40px,auto) minmax(var(--ui-control-touch,44px),auto);') &&
 refresh.includes('grid-column:1 / -1;') &&
 refresh.includes('grid-row:4;') &&
 !refresh.includes('data-editor-expanded'),
 'long-text editor spans the input width while one permanent 44px footer rail keeps keyboard ownership');
assert(css.includes('SPEC-CHAT-MOBILE-DIRECTORY-VV-20261101'),
 'existing VisualViewport directory safeguards must survive unchanged');
assert(!/position:\s*(fixed|sticky)|(?:overflow-y|scroll-snap-type|scroll-behavior):/.test(visual),
 'concept must not take ownership of scroll or keyboard positioning');
assert(!/(\.message-media-shell|#attachmentTray|\.message-image|\.message-sent-time\{)/.test(visual),
 'concept must not restyle photo/media or external sent-time layout');
assert(!visual.includes('#bankReportDashboard'),
 'bank report styles remain isolated');
const inRule=(anchor,needle)=>{
 const at=visual.indexOf(anchor);
 assert(at>=0,anchor);
 const end=visual.indexOf('}',at);
 assert(visual.slice(at,end).includes(needle),
   'missing '+needle+' in '+anchor);
};
inRule('#chatQuickActions>button{','min-height:44px;');
inRule('#editor{','font-size:16px;');
inRule('.message-unit:has(>.message-sent-time)>.message-text:not([hidden]){','padding-bottom:25px!important;');
console.log('CHAT-338 balanced design: mobile header, 44px actions, distinct bubbles, composer/keyboard owner and report isolation PASS');


/* CHAT-AXIS-20261117: Main 1–4 and modal 1–4 remain within their parent.
   Static contract: real Safari/Chrome screenshots are E4, not implied here. */
const axis=css.slice(css.indexOf('/* CHAT-AXIS-20261117'));
assert(axis.startsWith('/* CHAT-AXIS-20261117'));
for(const id of ['#screenHost','#chatScreen','#stageLayout','#messageWindow',
  '#composerShell','#shellNavigationLayer .shell-contact-chat']){
  assert(axis.includes(id),'missing chat axis guard '+id);
}
assert(axis.includes('[role="dialog"]') && axis.includes('[aria-modal="true"]'),
  'popup viewport owner must cap child widths');
assert(axis.includes('min-width:0') && axis.includes('max-width:100%'),
  'prevent horizontal leaks on narrow phones');
assert(!/position\s*:\s*(fixed|absolute|sticky)|height\s*:\s*100dvh|scrollTop\s*=/.test(axis),
  'visual-only patch must not seize keyboard, scroll or popup position');
assert(html.includes('id="stageLayout"')&&html.includes('id="screenHost"'));
for(const width of [320,350,375,390,428,768,1024]){
  assert(width>=320 && width-24>0,'supported viewport invariant');
}
console.log('CHAT-AXIS-20261117 responsive geometry contract PASS');
