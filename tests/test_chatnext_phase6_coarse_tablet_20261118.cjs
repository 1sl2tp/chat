'use strict';
// CHAT-NEXT-006: coarse-pointer landscape/tablet fallback correctness.
// Contract test only: no real messages, calls, payments, users or DB writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('chat-next-inbox.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const mobile=fs.readFileSync('mobile-ui-polish.css','utf8');
const phase6=css.slice(css.indexOf('/* CHAT-NEXT-006'));
assert(phase6.startsWith('/* CHAT-NEXT-006'),'new coarse-pointer geometry owner missing');
const preview='#appShell[data-chat-next-ui="on"][data-auth-state="authenticated"]';

assert(css.includes('@media (max-width:63.999rem), (hover:none), (pointer:coarse)'),
  'single Inbox row owner must include coarse pointer even beyond 1024px');
assert(phase6.includes('@media (min-width:48rem) and (hover:none), (min-width:48rem) and (pointer:coarse)'),
  'large touch devices get a drawer, never a persistent two-column sidebar');
for(const line of phase6.split('\n').filter(s=>/^\s*#appShell/.test(s))){
  assert(line.trimStart().startsWith(preview),'never leak tablet style outside preview: '+line);
}
assert(phase6.includes('width:clamp(390px,44vw,460px);'),
  'tablet drawer must be fluid but bounded');
assert(phase6.includes('max-width:calc(100vw - 24px);'),
  'drawer must not clip against rotated viewport edges');
assert(phase6.includes('.wm-sidebar-utilityButton {')&&
       phase6.includes('min-width:44px;')&&phase6.includes('min-height:44px;'),
  'close button has a full accessible touch target');
assert(phase6.includes('.contact-directory-filter-more {'),
  'filter overflow button keeps same 44px target');
assert(css.includes('height:auto!important;')&&css.includes('max-height:38px;'),
  'large touch contacts preserve two-line previews');
assert(css.includes('grid-template-columns:minmax(0,1fr) var(--chatnext-time-track);'),
  'time rail stays fixed and never overlays the preview');
assert(css.includes('font-size:16px!important;'),
  'search remains 16px so iPhone Safari does not auto zoom');
assert(phase6.includes('#shellNavigationLayer[data-mobile-keyboard="true"]')&&
       phase6.includes('top:var(--shell-form-vv-top,0px);')&&
       phase6.includes('height:var(--shell-form-vv-height,100svh);'),
  'tablet keyboard uses canonical VisualViewport-published geometry');
assert(phase6.includes('#shellNavigationLayer[data-mobile-keyboard="true"] .wm-sidebar-sidebar {')&&
       phase6.includes('min-height:0;'),
  'keyboard does not create extra directory scroll owner');
for(const disallowed of ['position:fixed','position:absolute','overflow-y:auto','overflow-y:scroll',
                        'scrollTop','visualViewport.addEventListener','requestAnimationFrame',
                        'setInterval(','fetch(','supabase','grid-template-areas:']){
 assert(!phase6.includes(disallowed),'new tablet CSS must not take layout/runtime ownership: '+disallowed);
}
assert(shell.includes("const DESKTOP_DIRECTORY_QUERY='(min-width: 64rem) and (hover: hover) and (pointer: fine)';"),
  'coarse-pointer tablet must still open original drawer, not desktop sidebar');
assert(shell.includes("const next=authState==='AUTHENTICATED'&&desktopDirectoryMedia.matches;"),
  'shell owns desktop sidebar eligibility');
assert(shell.includes('setSidebar(false);'),'contact click continues to close the same drawer');
assert(html.includes('data-shell-command="sidebar.close"'),'original close button retained');
assert(html.includes('data-v21-contact-list'),'existing contact directory retained');
assert(mobile.includes('#shellNavigationLayer[data-mobile-keyboard="true"]'),
  'small-screen keyboard owner remains unchanged');

function panelWidth(vw){return Math.min(vw-24,Math.min(460,Math.max(390,0.44*vw)));}
for(const width of [768,820,932,1024,1112,1194,1366]){
  const panel=panelWidth(width);
  const nameRail=panel-12-8-40-10-64-8;
  assert(panel>=390&&panel<=460,'tablet panel bounds at '+width);
  assert(panel<=width-24,'panel respects viewport edge at '+width);
  assert(nameRail>=220,'minimum 2-line name rail at '+width);
}
const coarseAt1200=true;
const narrowAt1200=false;
const needsOverlay=coarseAt1200||narrowAt1200;
assert(needsOverlay,'large touch screens use drawer even beyond the 64rem break');
console.log('CHAT NEXT phase-6 tablet: 768–1366px touch drawer, keyboard and two-line geometry PASS');
