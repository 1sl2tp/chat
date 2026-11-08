'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const directory=fs.readFileSync('contact-directory-admin.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const marker='/* UI-261 — Consistent directory and account-menu surfaces';
assert.equal(css.split(marker).length-1,1,'single mobile owner');
const ui=css.slice(css.indexOf(marker));
assert(ui.includes('@media(max-width:63.999rem){'),'desktop remains independent');
const prefix='#appShell[data-auth-state="authenticated"] #shellNavigationLayer ';
function rule(selector){
  const key=prefix+selector+'{', at=ui.indexOf(key);
  assert(at>=0,'missing '+selector);
  return ui.slice(at+key.length,ui.indexOf('}',at)).replace(/\s+/g,'');
}
for(const selector of ['.contact-directory-tools','.contact-directory-search',
 '.contact-directory-search:focus','.contact-directory-filter-line',
 '.contact-directory-filters','.contact-directory-filter',
 '.contact-directory-filter[data-active="true"]',
 '.contact-directory-filter-more','.shell-contact-row[data-active="true"]',
 '.contact-directory-empty'])rule(selector);
assert(rule('.contact-directory-search').includes('min-height:44px!important;'));
assert(rule('.contact-directory-filter').includes('min-height:44px!important;'));
for(const token of ['flex:0044px;','width:44px;','height:44px;'])
 assert(rule('.contact-directory-filter-more').includes(token),token);
assert(rule('.shell-contact-row[data-active="true"]').includes('inset3px00'));
assert(ui.includes('.shell-contact-chat:focus-visible'));
assert(ui.includes('[data-mobile-account-menu] .mobile-account-menu-panel{'));
assert(ui.includes('width:min(248px,calc(100vw - 24px))!important;'));
assert(ui.includes('[data-mobile-account-menu] .mobile-account-menu-row{'));
for(const key of ['all','customer','cm','friend','other'])
 assert(directory.includes('data-contact-directory-filter="'+key+'"'),'existing filter '+key);
assert(directory.includes('body.insertBefore(tools,nav);'),'keep pinned search and one list scroll owner');
assert(shell.includes('copy.append(title,preview,time);'),'preserve contact metadata');
for(const key of ['UI-254 — WhatsApp-aligned directory dividers','SPEC-CHAT-MOBILE-DIRECTORY-VV-20261101'])
 assert(css.includes(key),'preserve visual/keyboard contract '+key);
assert(sw.includes("const SHELL_CACHE_EPOCH='pwa-chat-notice-settings-ui262-20261108';"));
assert(sw.includes("const AVATAR_CACHE_NAME='taphoa-chat-avatars-v1';"));
console.log('UI-261 directory and mobile account-menu design contracts PASS');
