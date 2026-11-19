'use strict';
// CHAT-388: iOS Contacts-inspired mobile directory search dock.
// Static layout contract + existing keyboard owner and route invariants.
// No DB, fake customer messages, or browser notification side effects.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const dir=fs.readFileSync('contact-directory-admin.js','utf8');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const keyboard=fs.readFileSync('shell-form-viewport-policy.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const source=fs.readFileSync('index.source.html','utf8');
new vm.Script(dir);new vm.Script(shell);new vm.Script(keyboard);new vm.Script(sw);
assert.equal((dir.match(/class="contact-directory-search" type="search"/g)||[]).length,1,
 'one input; never clone text or move a focused iOS input');
assert(dir.includes('data-contact-directory-search-cancel aria-label="Đóng tìm kiếm"'));
assert(dir.includes("input.addEventListener('focus',()=>setSearchFocused(true))"));
assert(dir.includes("layer.dataset.directorySearchActive=String(focused)"));
assert(dir.includes('query=String(input.value||\'\')'));
assert(dir.includes('function closeSearch()'));
assert(dir.includes('input.blur()'));
assert(dir.includes('setSearchFocused(false)'));
assert(!dir.includes("input.addEventListener('blur',()=>requestAnimationFrame"),
 'do not reflow list in between touch-down and click on iOS');
assert(dir.includes("document.addEventListener('v21-mobile-directory-change'"),
 'directory must clean up focus mode after navigation');
assert(dir.includes('body.insertBefore(tools,nav)'), 'keep the original keyboard owner ancestry');
assert(keyboard.includes("node.closest?.('.contact-directory-tools')"));
assert(keyboard.includes("owner.kind==='directory'||owner.kind==='message-forward'"),
 'directory search must never scroll the whole overlay when keyboard appears');
assert(keyboard.includes("activeOwner.host.dataset.mobileKeyboard='true'"));
const start=css.indexOf('/* CHAT-388 —');
const end=css.indexOf('/* CHAT-AXIS-',start);
assert(start>=0&&end>start,'one scoped successor layout owner');
const patch=css.slice(start,end);
for(const selector of [
 '#appShell[data-auth-state="authenticated"][data-mobile-directory="true"]',
 '#shellNavigationLayer .wm-sidebar-body',
 '.contact-directory-tools',
 '.contact-directory-filter-line',
 '.wm-sidebar-navigation',
 '.contact-directory-search-field',
 '.contact-directory-search',
 '.contact-directory-search-cancel',
 'data-directory-search-active="true"',
 'data-mobile-keyboard="true"'
])assert(patch.includes(selector),'region rule missing '+selector);
for(const rule of [
 'grid-template-areas:"filters" "results" "search"',
 'grid-template-rows:auto minmax(0,1fr) auto;',
 'display:contents!important;',
 'grid-area:filters;',
 'grid-area:results;',
 'grid-area:search;',
 'overflow-y:auto;',
 'min-height:44px;',
 'font-size:16px!important;',
 'padding-bottom:6px;',
 'display:none!important;'
])assert(patch.includes(rule),'core mobile layout invariant '+rule);
assert(!/position:(?:fixed|absolute)|translate[XYZ]?\(/.test(patch),
 'no second floating owner or transform: the screen/keyboard owns height');
assert(source.includes('id="shellNavigationLayer"'));
assert(source.includes('class="wm-sidebar-navigation"'));
assert(css.includes('SPEC-CHAT-MOBILE-DIRECTORY-VV-20261101'));
assert(sw.includes("SHELL_CACHE_EPOCH='pwa-chat-ui388-directory-search-dock-20261119'"));
console.log('CHAT-388 mobile directory search dock / focus / single-scroll owner PASS');
