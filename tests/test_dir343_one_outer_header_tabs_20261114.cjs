'use strict';
// DIR-343: source + isolated DOM-state contract, no browser/network or financial writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const directory=fs.readFileSync('contact-directory-admin.js','utf8');
const mobile=fs.readFileSync('work-customer-summary.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');

const start=directory.indexOf('function mobileDirectoryHeaderVisible(){');
const end=directory.indexOf('function directoryTools(){',start);
assert(start>0&&end>start,'one authoritative header-visibility owner');
const switcher={attrs:{},dataset:{},
 setAttribute(k,v){this.attrs[k]=String(v);},
 querySelector(selector){
  if(selector==='[data-top-tab="chat"]')return chat;
  if(selector==='[data-top-tab="photos"]')return right;
  return null;
 }};
const chat={attrs:{},setAttribute(k,v){this.attrs[k]=String(v);}};
const right={textContent:'Ảnh',attrs:{},setAttribute(k,v){this.attrs[k]=String(v);}};
const app={dataset:{mobileDirectory:'true',route:'chat'}};
let admin=true,small=true;
const context=vm.createContext({
 window:{matchMedia:()=>({matches:small})},
 document:{querySelector:q=>q==='#regionTop .top-mode-switch'?switcher:null,
   getElementById:id=>id==='appShell'?app:null},
 currentAdmin:()=>admin?{id:'admin',role:'admin'}:null,
 String,Boolean
});
vm.runInContext("let directorySection='chat';"+
 directory.slice(start,end)+
 "\nthis.sync=syncMobileDirectoryHeader;this.choose=v=>directorySection=v;",context);
assert.equal(context.sync(),true);
assert.equal(right.textContent,'Công việc');
assert.equal(chat.attrs['aria-selected'],'true');
assert.equal(right.attrs['aria-selected'],'false');
assert.equal(switcher.dataset.directoryOwner,'true');
assert.equal(switcher.attrs['aria-label'],'Trò chuyện và Công việc');
context.choose('work');context.sync();
assert.equal(chat.attrs['aria-selected'],'false');
assert.equal(right.attrs['aria-selected'],'true');
app.dataset.mobileDirectory='false';context.sync();
assert.equal(right.textContent,'Ảnh','Photos only comes back in actual conversation');
assert.equal(switcher.dataset.directoryOwner,'false');
assert.equal(right.attrs['aria-selected'],'false');
app.dataset.route='photos';context.sync();
assert.equal(right.attrs['aria-selected'],'true','real photos route remains supported');
app.dataset.mobileDirectory='true';admin=false;context.sync();
assert.equal(right.textContent,'Ảnh','non-Admin user never sees a business switch');
admin=true;small=false;context.sync();
assert.equal(right.textContent,'Ảnh','desktop keeps existing navigation');
small=true;context.sync();
assert.equal(right.textContent,'Công việc');

assert(html.includes('data-top-tab="photos" data-nav-target="photos"'),
 'photo feature is preserved, not deleted from app');
assert(html.includes('DIR-343: on the outer Admin directory'));
assert(html.includes('#appShell[data-mobile-directory="true"] .top-mode-switch[data-directory-owner="true"]'));
assert(directory.includes('#appShell[data-mobile-directory="true"] .contact-directory-sections{display:none!important}'),
 'no duplicate Chat/Work bar beneath the outer one on mobile');
assert(directory.includes("document.addEventListener('v21-mobile-directory-change',syncMobileDirectoryHeader);"));
assert(directory.includes("event.stopImmediatePropagation();"));
assert(directory.includes(`directoryTools()?.querySelector('[data-contact-directory-section="'+next+'"]')?.click();`),
 'top tabs navigate only the directory section while open, never the photo route');
assert(mobile.includes("document.dispatchEvent(new CustomEvent('v21-mobile-directory-change',{detail:{open:true}}));"));
assert(mobile.includes("document.dispatchEvent(new CustomEvent('v21-mobile-directory-change',{detail:{open:false}}));"));
assert(mobile.includes("if(mobileDirectoryOpen()&&snapshot().account?.role==='admin')return;"),
 'mobile double-tap owner yields Chat tab in outer directory');
assert(shell.includes("NavigationCommand.openPhotos")||shell.includes("openPhotos(){return this.open('photos')}"),
 'normal photo routing remains intact outside directory');
assert(!shell.includes('mobileDirectoryVisible'),'no second, inferred directory state');
console.log('DIR-343 outer Chat/Work only, one bar, no Photos on directory, Photos restored in conversation PASS');
