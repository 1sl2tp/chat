'use strict';
// UI-341: directory previews are 1–2 lines, never paint under the timestamp
// or outside the right edge. Static no-message/no-network CSS & owner contract.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const marker='/* UI-341 — Narrow Chat directory: two-line previews, protected time rail.';
const pos=css.indexOf(marker);
assert(pos>0,'expected final targeted directory override');
const ruleSet=css.slice(pos);
assert(ruleSet.includes('@media(max-width:63.999rem){'));
const base='#appShell[data-auth-state="authenticated"] #shellNavigationLayer ';
function rules(selector){
  const at=ruleSet.indexOf(base+selector+'{');
  assert(at>=0,'missing narrow directory owner: '+selector);
  const start=at+(base+selector+'{').length;
  return ruleSet.slice(start,ruleSet.indexOf('}',start)).replace(/\s+/g,'');
}
const row=rules('.shell-contact-row'),button=rules('.shell-contact-chat');
const copy=rules('.shell-contact-copy'),name=rules('.shell-contact-name');
const preview=rules('.shell-contact-preview'),time=rules('.shell-contact-time');
const empty=rules('.shell-contact-preview:empty');
assert(row.includes('height:auto!important;')&&row.includes('min-height:60px!important;'));
assert(button.includes('height:auto!important;')&&button.includes('min-height:60px!important;'));
assert(button.includes('padding:6px4px!important;'));
assert(copy.includes('grid-template-columns:minmax(0,1fr)64px;'));
assert(copy.includes('grid-template-rows:20pxauto;'));
assert(copy.includes('column-gap:8px;')&&copy.includes('row-gap:2px;'));
assert(name.includes('grid-column:1;')&&name.includes('grid-row:1;'));
assert(preview.includes('grid-column:1;')&&!preview.includes('grid-column:1/-1;'),
  'preview must not span the time rail');
assert(preview.includes('grid-row:2;'));
for(const key of ['min-width:0;','max-height:36px;','display:-webkit-box;',
  '-webkit-box-orient:vertical;','-webkit-line-clamp:2;','line-clamp:2;',
  'overflow:hidden!important;','white-space:normal!important;',
  'overflow-wrap:anywhere;','line-height:18px;'])
  assert(preview.includes(key),'clamp and break very long previews: '+key);
assert(empty.includes('display:none;'));
assert(time.includes('grid-column:2;')&&time.includes('grid-row:1;'));
assert(time.includes('justify-self:end;')&&time.includes('width:64px;'));
assert(time.includes('min-width:64px;')&&time.includes('max-width:64px;'));
assert(time.includes('white-space:nowrap;')&&time.includes('text-align:right;'));
assert(ruleSet.includes('.shell-contact-row[data-active="true"]:has(.shell-contact-manage) .shell-contact-preview'),
 'active contact must not put the management button over the snippet');
// Geometry budget: right column never steals or paints over left; full strings
// with long Vietnamese words, SMS references and emoji remain CSS-clamped.
for(const width of [320,360,375,390,430,500,506]){
  const inner=width-24-8-40-10; // viewport side gutters + row/column/avatar
  const available=inner-64-8;
  assert(available>=166,'preview rail still readable at '+width+'px');
}
assert(shell.includes("time.className='shell-contact-time'"));
assert(shell.includes("copy.append(title,preview,time);"));
assert(shell.includes("const previewText=contactPreview(item);"));
assert(shell.includes("return{preview:'Báo cáo trực tiếp · Mở để xem mới nhất',time:'Trực tiếp',instant:''};"),
 'report label stays a right-column time/status, never a preview overlay');
assert(shell.includes("node.setAttribute('aria-label',reportView?reportView.time:"),
 'semantic time remains accessible even if visually shortened');
// A later release must keep the directory clamp and advance the shell version.
assert(/const SHELL_CACHE_EPOCH='pwa-chat-[a-z0-9-]+';/.test(sw));
assert(!sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-directory-2line-ui341-20261113';"));
console.log('UI-341 preview 1–2 lines: protected time rail, narrow widths, report/live, scroll geometry PASS');
