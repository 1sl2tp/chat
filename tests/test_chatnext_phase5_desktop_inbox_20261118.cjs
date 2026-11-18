'use strict';
// CHAT-NEXT-005: desktop Inbox geometry — source-level contract only.
// No network, customer data, browser session or Supabase writes are performed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('chat-next-inbox.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const start=css.indexOf('/* CHAT-NEXT-005 / Phase 5');
assert(start>0,'desktop candidate stylesheet owner missing');
const chunk=css.slice(start);
assert(chunk.includes('@media (min-width:64rem) and (hover:hover) and (pointer:fine)'),
 'desktop style must not take over iPad coarse-pointer or one-column mobile');
const prefix='#appShell[data-chat-next-ui="on"][data-auth-state="authenticated"]';
for(const line of chunk.split('\n').filter(row=>/^\s*#appShell/.test(row))){
 assert(line.trimStart().startsWith(prefix),'no unscoped desktop selector: '+line);
}
assert(chunk.includes('#screenHost {\n    --desktop-directory-width:clamp(304px,25vw,360px);'),
 'use the existing desktop grid width token rather than a new grid owner');
assert(!chunk.includes('grid-template-areas:'));
assert(!chunk.includes('grid-template-columns:var(--desktop-directory-width)'),
 'existing shell stays the one desktop grid owner');
assert(!chunk.includes('position:fixed'));
assert(!chunk.includes('overflow-y:auto'));
assert(!chunk.includes('overflow-y:scroll'));
assert(!chunk.includes('scrollTop'));
assert(!chunk.includes('position:sticky'));
assert(!chunk.includes('100dvh'));
assert(!chunk.includes('height:100vh'));
assert(chunk.includes('#shellNavigationLayer .wm-sidebar-header {'));
assert(chunk.includes('#shellNavigationLayer .contact-directory-tools {'));
assert(chunk.includes('#shellNavigationLayer [data-v21-contact-list] {'));
assert(chunk.includes('grid-template-columns:40px minmax(0,1fr);'),
 'avatar 40px must not be squashed at minimum rail width');
assert(chunk.includes('grid-template-columns:minmax(0,1fr) 64px;'),
 'timestamp must have one fixed track, independent of preview');
assert(chunk.includes('font-variant-numeric:tabular-nums;'));
assert(chunk.includes('grid-column:1;\n    grid-row:2;'),
 'preview cannot paint underneath the timestamp');
assert(chunk.includes('height:70px;')&&chunk.includes('min-height:70px;'),
 'fixed two-line desktop list row geometry');
assert(chunk.includes('.shell-sidebar-account-main:focus-visible {'),
 'account action must retain a visible keyboard focus ring');
assert(css.includes('@media (max-width:63.999rem), (hover:none), (pointer:coarse)'),
 'overlay Inbox stays separate on narrow and coarse-pointer devices');
assert(html.includes('data-v21-contact-list'));
assert(html.includes('id="shellNavigationLayer"'));
assert(html.includes('id="regionTop"'));
assert(shell.includes('const WORK_ENABLED=false;'),
 'do not activate unfinished desktop Work region');
assert(shell.includes('const DESKTOP_DIRECTORY_QUERY='),
 'desktop mode is owned by the original pointer-aware breakpoint');

function rail(viewport){
 return Math.min(360,Math.max(304,viewport*0.25));
}
for(const width of [1024,1100,1280,1366,1440,1600,1920]){
 const sidebar=rail(width),conversation=width-sidebar;
 const listText=sidebar-16-16-40-11-64-8;
 assert(sidebar>=304&&sidebar<=360,'side rail token bounded');
 assert(conversation>=720,'desktop conversation remains usable at '+width);
 assert(listText>=149,'contact name stays readable at '+width);
}
for(const banned of ['fetch(', 'setInterval(', 'supabase', 'bank-ledger', 'messageWindow','composerShell']){
 assert(!chunk.includes(banned),'visual-only desktop style cannot own runtime: '+banned);
}
const conversation=fs.readFileSync('chat-next-conversation.css','utf8');
const panelStart=conversation.indexOf('/* CHAT-NEXT-005: desktop Chat surface');
assert(panelStart>0,'desktop conversation styles must exist');
const desktopChat=conversation.slice(panelStart);
assert(desktopChat.includes('@media (min-width:64rem) and (hover:hover) and (pointer:fine)'));
assert(desktopChat.includes('#stageLayout:not([data-bank-report-active="true"])'),
 'never paint business Bank report with customer chat styles');
assert(desktopChat.includes('text-overflow:ellipsis;'),
 'long names must yield before action buttons');
assert(desktopChat.includes('#chatQuickActions:not([hidden]) > button:focus-visible'),
 'desktop customer actions need keyboard-visible focus');
for(const banned of ['#messageWindow','position:absolute','position:fixed','grid-template-columns',
 'min-height:100vh','scrollTop','fetch(','setInterval(']){
 assert(!desktopChat.includes(banned),'conversation surface must not own layout/runtime: '+banned);
}
console.log('CHAT NEXT phase-5 desktop Inbox: 1024–1920 widths, time rail, owner scoping PASS');
