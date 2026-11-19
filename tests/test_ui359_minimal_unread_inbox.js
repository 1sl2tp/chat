'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const shell=fs.readFileSync('shell.js','utf8');
const dir=fs.readFileSync('contact-directory-admin.js','utf8');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert.equal(shell.split('row.dataset.unread=String(item.has_unread===true)').length-1,2);
assert(shell.includes("unread.hidden=!Boolean(item.has_unread)"));
for(const token of ['.shell-contact-row[data-unread="true"] .shell-contact-name',
 '.shell-contact-row[data-unread="true"] .shell-contact-preview',
 '.shell-contact-row[data-unread="true"] .shell-contact-time'])
 assert(css.includes(token),token);
const start=shell.indexOf('function renderMenuUnread(){');
const end=shell.indexOf('\nfunction syncSidebarPresentation(){',start);
assert(start>=0&&end>start);
const dot={hidden:true},attr={},listeners={};
const menu={dataset:{},querySelector:()=>dot,setAttribute:(key,v)=>{attr[key]=v;},removeAttribute:(key)=>{delete attr[key];}};
const chip={dataset:{},setAttribute:(key,v)=>{chip[key]=v;}};
const document={
 querySelectorAll:(selector)=>selector.includes('sidebar.open')?[menu]:[chip],
 addEventListener:(name,callback)=>{listeners[name]=callback;}
};
const appShell={dataset:{mobileDirectory:'true'}};
const ctx={document,appShell,unreadCount:0,authState:'AUTHENTICATED',accountMenuOpen:false,
 window:{matchMedia:()=>({matches:true})}};
vm.createContext(ctx);
vm.runInContext(shell.slice(start,end)+';globalThis.indicator=UnreadIndicator;',ctx);
ctx.indicator.set(4);
assert.equal(dot.hidden,true,'the open list must not duplicate unread on the menu');
assert.equal(chip.dataset.hasUnread,'true');
assert.equal(chip['aria-label'],'Chưa đọc, có 4 tin mới');
appShell.dataset.mobileDirectory='false';
listeners['v21-mobile-directory-change']();
assert.equal(dot.hidden,false,'outside the list, the navigation dot is useful');
ctx.indicator.clear();
assert.equal(dot.hidden,true);
assert.equal(chip.dataset.hasUnread,'false');
assert(dir.includes('aria-controls="contactDirectoryFilterList"'));
assert(dir.includes('filterLine.dataset.expanded'));
assert(dir.includes('filterArrowSync=syncFilterArrow'));
assert(dir.includes("document.addEventListener('v21-mobile-directory-change',()=>filterArrowSync?.())"));
assert(dir.includes("mobileDirectoryHeaderVisible()"));
assert(css.includes('.contact-directory-filter-line:not([data-expanded="true"])'));
assert(css.includes('.contact-directory-filter-line[data-expanded="true"] .contact-directory-filters'));
const release=source.match(/name="app-release-version" content="(V\d+\.\d+\.\d+)"/)?.[1];
assert(release,'canonical release missing');
assert(sw.includes("const RELEASE_VERSION='"+release+"';"),'SW and HTML release must match');
const epoch=sw.match(/const SHELL_CACHE_EPOCH='pwa-chat-(?:ui|img)(\d+)-[^']+'/);
assert(epoch && Number(epoch[1])>=359,'PWA epoch must preserve UI-359 release and allow newer UI releases');
assert(sw.includes('CACHE_NAME'));
console.log('PASS UI-359 unread cue, compact contact filters, release');
