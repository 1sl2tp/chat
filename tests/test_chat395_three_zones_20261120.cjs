'use strict';
// CHAT-395: three independent regions in the real mobile directory.
// Static, offline and read-only. Does not send messages or connect to banking.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const directory=fs.readFileSync('contact-directory-admin.js','utf8');
const platform=fs.readFileSync('shell-form-viewport-policy.js','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const at=css.indexOf('/* CHAT-388 — ONE mobile directory layout owner (389/390/391/392 compatible).');
const end=css.indexOf('/* CHAT-AXIS-',at);
assert(at>=0&&end>at,'single mobile directory owner');
const owner=css.slice(at,end);
const normalize=body=>body.replace(/\s+/g,'');
const decl=selector=>{
  const pos=owner.indexOf(selector+'{');
  assert(pos>=0,'missing selector '+selector);
  const from=pos+selector.length+1;
  const to=owner.indexOf('}',from);
  assert(to>from,'unclosed rule '+selector);
  return normalize(owner.slice(from,to));
};
const prefix='#appShell[data-auth-state="authenticated"][data-mobile-directory="true"] #shellNavigationLayer ';
const topOne=decl('#appShell[data-auth-state="authenticated"][data-mobile-directory="true"] #regionTop .top-mode-switch[data-directory-owner="true"]');
assert(topOne.includes('min-height:44px'),'Top 1 has one touch-sized bar');
const root=decl(prefix+'.wm-sidebar-body');
assert(root.includes('grid-template-rows:autoautominmax(0,1fr)'),'Top 2 has two auto rows; content gets remainder');
assert(root.includes('grid-template-areas:"search""filters""results"'));
const search=decl(prefix+'.contact-directory-search-field');
const compact=decl(prefix+'.contact-directory-search-field[data-expanded="false"]');
const input=decl(prefix+'.contact-directory-search');
const toggle=decl(prefix+'.contact-directory-search-toggle');
const filters=decl(prefix+'.contact-directory-filters');
const list=decl(prefix+'.wm-sidebar-navigation');
assert(search.includes('grid-area:search;'));
assert(search.includes('min-height:48px;'),'search row keeps 44px input plus compact spacing');
assert(compact.includes('min-height:48px;'),'collapsed search uses the same compact track');
assert(!compact.includes('display:none'),'inactive search field remains visible');
assert(input.includes('height:44px!important;')&&input.includes('font-size:16px!important;'));
assert(toggle.includes('display:none!important'),'mobile tap directly into the input, no duplicate search button');
assert(filters.includes('overflow-x:auto;')&&filters.includes('flex-wrap:nowrap;'),'groups are one horizontally scrolling rail');
assert(!owner.includes('.contact-directory-filter-line:not([data-expanded="true"]) .contact-directory-filter:not('),
  'do not silently hide customer categories in the normal state');
assert(list.includes('grid-area:results;')&&list.includes('overflow-y:auto;'));
assert.equal((owner.match(/grid-area:results;/g)||[]).length,1,'one vertical list scroller');
assert(owner.includes('grid-template-areas:"search" "results";'),'typing keeps input and result list');
assert(owner.includes('#shellNavigationLayer[data-directory-search-active="true"] .contact-directory-filter-line'),'hide filters only during typing');
assert(!owner.includes('position:fixed'),'no secondary viewport owner');
assert.equal((directory.match(/class="contact-directory-search" type="search"/g)||[]).length,1,'one input');
assert(directory.includes("input.addEventListener('focus',()=>setSearchFocused(true))"));
assert(directory.includes('restoreDirectoryViewport();'),'preserve navigation scroll anchor');
const arrowStart=directory.indexOf('function syncFilterArrow()');
const arrowEnd=directory.indexOf("rail?.addEventListener('scroll',syncFilterArrow",arrowStart);
assert(arrowStart>0 && arrowEnd>arrowStart,'filter controller owner');
assert(!directory.slice(arrowStart,arrowEnd).includes('rail.scrollLeft=0;'),
 'filter scrolling must not snap back when the user swipes');
assert(directory.includes('rail.scrollLeft=Math.max(0,rail.scrollLeft+delta);'),
 'after selection, the chosen category must remain visible');
assert(platform.includes("owner.kind==='directory'||owner.kind==='message-forward'"),'P0 still owns IME');
assert(source.includes('data-top-tab="chat"')&&source.includes('data-top-tab="photos"'),'reuse existing shell tabs');
console.log('CHAT-395 3-region compact search/filter/directory mobile contract PASS');
