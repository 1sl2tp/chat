'use strict';
// CHAT-390: one input, collapsible search, one viewport/scroll owner.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const dir=fs.readFileSync('contact-directory-admin.js','utf8');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const viewport=fs.readFileSync('shell-form-viewport-policy.js','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
new vm.Script(dir);
assert.equal((dir.match(/class="contact-directory-search" type="search"/g)||[]).length,1);
for(const s of [
 'data-contact-directory-search-toggle aria-label="Mở tìm kiếm danh bạ"',
 'aria-controls="contactDirectorySearchInput"',
 'data-expanded="false"',
 "searchToggle?.addEventListener('click'",
 'input.focus({preventScroll:true})',
 'void input.offsetWidth',
 'searchField.dataset.expanded=String(focused)',
 "searchToggle?.setAttribute('aria-expanded',String(focused))",
 "cancelSearch?.addEventListener('click',closeSearch)",
 'resetDirectorySearchMode=closeSearch',
 'if(resetDirectorySearchMode){resetDirectorySearchMode();return;}',
 'if(hadQuery)syncDirectoryRows({reorder:false})'
])assert(dir.includes(s),'missing search state '+s);
assert(viewport.includes("owner.kind==='directory'||owner.kind==='message-forward'"));
const start=css.indexOf('/* CHAT-388 —');
const end=css.indexOf('/* CHAT-AXIS-',start);
assert(start>=0&&end>start,'layout owner present');
const patch=css.slice(start,end);
for(const s of [
 '.contact-directory-search-field[data-expanded="false"]',
 '.contact-directory-search-toggle',
 '.contact-directory-search-field[data-expanded="true"] .contact-directory-search-toggle',
 '#shellNavigationLayer[data-mobile-keyboard="true"]',
 'var(--shell-form-vv-height,100svh)',
 'var(--header-height,72px)'
])assert(patch.includes(s),'missing viewport/layout contract '+s);
assert(source.includes('V21.72.42'));
assert(sw.includes('pwa-chat-ui391-filter-rail-keyboard-state-20261119'));
console.log('CHAT-390 collapsible directory search + iOS keyboard contract PASS');
