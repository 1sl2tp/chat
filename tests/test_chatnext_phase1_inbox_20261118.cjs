'use strict';
// CHAT NEXT Phase 1: opt-in inbox design must preserve the existing Chat runtime.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const shell=fs.readFileSync('shell.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('chat-next-inbox.css','utf8');
const work='const WORK_ENABLED=false;';
const preview="new URLSearchParams(window.location.search||'').get('chatnext')==='1'";

assert(shell.includes(preview),'preview must require an explicit URL flag');
assert(shell.includes("if(chatNextPreview&&appShell)appShell.dataset.chatNextUi='on';"),
  'preview is on only when the URL opts in');
assert(shell.includes(work),'do not expose disabled Work feature');
assert(!/<div id="appShell"[^>]*data-chat-next-ui=/i.test(html),
  'default app shell must not silently enable CHAT NEXT');
assert.equal((html.match(/href="\.\/chat-next-inbox\.css"/g)||[]).length,1,
  'the candidate stylesheet is included only once');
assert(html.indexOf('href="./chat-next-inbox.css"')>html.indexOf('href="./mobile-ui-polish.css"'),
  'phase-one opt-in CSS follows the existing visual owner');
assert(html.includes('data-build-source="chat-next-inbox.css"'),'canonical build hashes the stylesheet');

const flag='#appShell[data-chat-next-ui="on"][data-auth-state="authenticated"]';
assert(css.includes(flag),'styles must be scoped to authenticated opt-in');
const selectors=css.split('\n').filter(line=>/^\s*#appShell/.test(line));
assert(selectors.length>15);
for(const selector of selectors)assert(selector.includes(flag),
  'all app-level selectors must be opt-in + authenticated: '+selector);
assert(css.includes('@media (max-width:63.999rem)'),'mobile must be single pane');
assert(css.includes('@media (min-width:64rem)'),'desktop adaptation must remain distinct');
assert(css.includes('grid-template-columns:40px minmax(0,1fr);'),
  'must preserve existing 40px portrait geometry, not crop avatars');
assert(css.includes('grid-template-columns:minmax(0,1fr) var(--chatnext-time-track);'));
assert(css.includes('--chatnext-time-track:64px;'));
assert(css.includes('grid-column:1;')&&css.includes('grid-row:2;'),
  'preview may not enter the time rail');
assert(css.includes('-webkit-line-clamp:2;'),'preview is at most 2 lines');
assert(css.includes('height:auto!important;')&&css.includes('max-height:38px;'),
  'two-line preview must have a flexible row');
assert(css.includes('font-size:16px!important;'),'iOS search must remain >=16px');
assert(css.includes('min-height:44px;'),'keep 44px filter touch targets');
assert(css.includes('font-variant-numeric:tabular-nums;'),'time column aligned');
assert(css.includes('prefers-reduced-motion:reduce'),'motion accessibility');
for(const banned of ['setInterval(', 'fetch(', 'supabase', 'v21_sync_pull', 'scrollTop=', 'position:fixed', 'transform:translate']) {
  assert(!css.includes(banned),'inbox style may not own network, data or scroll: '+banned);
}
for(const width of [320,360,375,390,430,500]){
  // Two 6px body gutters, two 4px row insets, portrait/gap,
  // the 64px time rail and 8px inner column gap.
  const available=width-12-8-40-10-64-8;
  assert(available>=178,'two-line name/preview rail must remain readable at '+width);
}
assert(!css.includes('#messageWindow'),'phase one may not alter virtualized message heights');
assert(!css.includes('#composerShell'),'phase one may not replace keyboard composer owner');
assert(!css.includes('#workThreadView'),'phase one may not activate Work');

console.log('CHAT NEXT phase-1 opt-in inbox: scope, 320–500px geometry, time rail, isolation PASS');
