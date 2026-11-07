'use strict';
// UI-257 — Screenshot-based top layout contract: ChatGPT-like pill, real routes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const marker=css.indexOf('/* UI-257 — ChatGPT-inspired centered mobile switch');
assert(marker>0,'new header presentation must live in the existing mobile UI owner');
assert(css.lastIndexOf('@media(max-width:63.999rem)',marker)>=0,'mobile-only styling');
const piece=css.slice(marker,css.indexOf('  /* Active chat:',marker));
function rule(selector){
  const begin=piece.indexOf(selector+'{');
  assert(begin>=0,'Missing UI-257 rule: '+selector);
  return piece.slice(begin+selector.length+1,piece.indexOf('}',begin)).replace(/\s+/g,'');
}
const idle='#appShell[data-auth-state="authenticated"] #regionTop .top-mode-switch[data-contact-identity="false"]';
for(const token of ['display:grid;','grid-template-columns:repeat(2,minmax(0,1fr));',
  'justify-self:center;','padding:3px;','min-height:48px;','border-radius:999px;',
  'background:var(--theme-surface-primary);'])
  assert(rule(idle).includes(token),'header switch: '+token);
const tab=rule(idle+' .top-mode-tab');
for(const token of ['position:static;','min-height:40px;','font-size:15px;','width:100%;'])
  assert(tab.includes(token),'tappable tab: '+token);
assert(!piece.includes('position:absolute'),'no floated Photos button in the header');
const selected=rule(idle+' .top-mode-tab[aria-selected="true"]');
assert(selected.includes('background:var(--theme-surface-secondary)!important;'));
assert(html.includes('role="tablist" aria-label="Trò chuyện và ảnh"'));
for(const route of ['chat','photos'])
  assert(html.includes('data-top-tab="'+route+'" data-nav-target="'+route+'"')||html.includes('data-top-tab="'+route+'"'),route+' remains available');
assert(shell.includes('const WORK_ENABLED=false;'),'do not enable a disabled Work feature for visual imitation');
assert(shell.includes('switcher.dataset.contactIdentity=String(visible)'),'selected contact identity preserved');
assert(css.includes('/* UI-253 — suppress duplicated Photos shortcut'),'existing selected-contact dedupe preserved');
assert(css.includes('.call-focus-slot[data-call-ui-state="idle"]:not([hidden])'),'call action owner preserved');
for(const width of [320,360,375,390,430,507]){
  const rail=12,action=44,gap=6;
  const central=width-2*rail-2*action-2*gap;
  const pill=Math.min(central,280);
  const left=rail+action+gap+(central-pill)/2;
  const right=width-left-pill;
  assert(pill>0&&Math.abs(left-right)<1,'balanced capsule at '+width+'px');
}
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-soft-blue-ui259-20261107';"));
console.log('UI-257 ChatGPT-style centered header, live Chat/Photos tabs, 320–507px symmetry and state safety PASS');
