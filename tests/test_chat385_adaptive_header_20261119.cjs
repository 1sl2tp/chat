'use strict';
// CHAT-385: production header geometry & scroll state regression contract.
// Pure source/decision tests run without contacting customers, Supabase or Zalo.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const css=fs.readFileSync('mobile-chat-refresh.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
new vm.Script(app);
new vm.Script(shell);
assert(source.includes('id="regionTop"')&&source.includes('id="scrollRoot"'));
const start=app.indexOf('function adaptiveHeaderDecision(');
const end=app.indexOf('\nfunction setAdaptiveHeaderMode(',start);
assert(start>0&&end>start,'one pure mobile header policy');
const sandbox={};
vm.runInNewContext(
 "const ADAPTIVE_HEADER_MODES={NORMAL:'normal',READING:'reading',TYPING:'typing'};\n"+
 app.slice(start,end)+"\nthis.pick=adaptiveHeaderDecision;",sandbox
);
assert.equal(sandbox.pick('normal',-32,500),'reading','read older: reclaim header height');
assert.equal(sandbox.pick('normal',-27,500),'normal','tiny motion: avoid jitter');
assert.equal(sandbox.pick('normal',-32,80),'normal','near last: keep identity');
assert.equal(sandbox.pick('normal',32,500),'normal','downward motion: no read collapse');
assert.equal(sandbox.pick('reading',40,300),'reading','read remains zero-height when peeking');
assert.equal(sandbox.pick('reading',-40,300),'reading','read remains zero-height while hiding overlay');
assert.equal(sandbox.pick('reading',0,20),'normal','follow newest: restore primary header');
for(const item of [
 "viewport.mode===VIEWPORT_STATES.USER_AWAY",
 'firstVisibleAnchor()',
 'restoreAnchor(anchor)',
 "setScrollTop(scrollRoot.scrollHeight-scrollRoot.clientHeight)",
 'updateAdaptiveHeaderFromUserScroll(top,delta);',
 "document.addEventListener('v21-active-contact-change',resetAdaptiveHeaderForContext)",
 "document.addEventListener('navigation-change',resetAdaptiveHeaderForContext)",
 "document.addEventListener('v21-mobile-directory-change',resetAdaptiveHeaderForContext)",
 "document.addEventListener('call-state',resetAdaptiveHeaderForContext)",
 'stageLayout?.dataset.bankReportActive',
 "document.activeElement===editor || KeyboardInsetAdapter.open",
 "requestAnimationFrame(resetAdaptiveHeaderForContext)"
])assert(app.includes(item),'must retain single owner and guards: '+item);
assert(shell.includes("appShell.dataset.chatContact=String(Boolean(activeContact?.id));"),'contact gating must update before events');
for(const s of [
 '[data-chat-header-mode="normal"]','--header-height:48px',
 '[data-chat-header-mode="reading"]','--header-height:0px',
 '[data-chat-header-mode="typing"]','--header-height:44px',
 '[data-chat-header-peek="true"]',
 'visibility:hidden','pointer-events:none','transform:translateY(-100%)',
 '.call-focus-slot[data-call-ui-state="idle"]'
])assert(css.includes(s),'production header CSS contract: '+s);
assert(css.includes('#regionTop .compact-top-grid'),'use existing Header P1 owner');
// Preserve the true keyboard and message transport owners.
assert(app.includes('KeyboardInsetAdapter.update()'),'native software keyboard owner remains');
assert(app.includes('function setScrollTop(value)'),'no second scrollTop setter');
assert(!css.includes('.conversation{grid-template'),'no new parallel conversation view');
console.log('CHAT-385 adaptive header production source/decision contract PASS');
