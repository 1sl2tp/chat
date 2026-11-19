'use strict';
// CHAT-396: read-only Shell drawer regression; no RPC, messages or real accounts.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const shell=fs.readFileSync('shell.js','utf8');
const mobile=fs.readFileSync('work-customer-summary.js','utf8');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
const src=fs.readFileSync('index.source.html','utf8');
new vm.Script(shell);new vm.Script(mobile);
assert.equal((src.match(/id="mobileChatDrawer"/g)||[]).length,1,'one modal navigation drawer');
assert(src.includes('aria-modal="true"')&&src.includes('data-mobile-drawer-close'));
assert(src.includes('data-mobile-drawer-recents'));
for(const key of ['directory','search','new','profile','settings','photos','logout']){
  assert(src.includes('data-mobile-drawer-action="'+key+'"'),'functional UI intent '+key);
}
assert(css.includes('#mobileChatDrawer:not([hidden])'));
assert(css.includes('.mobile-chat-drawer-panel'));
assert(css.includes('grid-template-rows:auto auto minmax(0,1fr) auto;'));
assert(css.includes('overscroll-behavior-y:contain;'));
assert(css.includes('prefers-reduced-motion:reduce'));
assert(mobile.includes('return window.ChatAppShell.MobileDrawer.toggle();'),
  'the capture click owner must dispatch the visible button to the Shell drawer');
assert(mobile.includes('if(mobileHeaderReturnsToDirectory())'),
  'the in-thread back chevron is never the drawer');
assert(shell.includes('MobileDrawer:Object.freeze('));
assert(shell.includes('NavigationCommand.openContact(drawerRecent.dataset.mobileDrawerContactId,'),
  'one canonical conversation selection owner');
assert(shell.includes('document.querySelector(\'[data-account-menu-logout]\')?.click?.();'),
  'logout uses the established authenticated action');
const begin=shell.indexOf('function renderMobileChatDrawerRecents(){');
const end=shell.indexOf('\nfunction setSidebar(open){',begin);
assert(begin>0&&end>begin);
const section=shell.slice(begin,end);
assert(!section.includes('innerHTML'),'never interpolate customer names into HTML');
assert(!section.includes('.rpc('),'drawer never fetches/changes bank or customer state');
assert(!section.includes('scrollTop='),'drawer never moves the chat or directory scroller');

class Fake {
  constructor(tag='div'){this.tag=tag;this.dataset={};this.children=[];this.attrs={};
    this.hidden=false;this.disabled=false;this.isConnected=true;this.textContent='';}
  appendChild(n){this.children.push(n);return n;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  replaceChildren(node){this.children=node.tag==='fragment'?node.children:[node];}
  focus(opts){this.focused=true;this.focusOptions=opts;}
}
const drawer=new Fake('div'),recents=new Fake('div'),settings=new Fake('button'),directory=new Fake('button');
drawer.hidden=true;
drawer.querySelector=s=>{
  if(s==='[data-mobile-drawer-recents]')return recents;
  if(s==='[data-mobile-drawer-action="settings"]')return settings;
  if(s==='[data-mobile-drawer-action="directory"]')return directory;
  return null;
};
function fakeRow(name,id,preview,unread=false,pinned=''){
  const selected=new Fake('button');selected.dataset.contactId=id;selected.dataset.contactName=name;
  const title=new Fake('span');title.textContent=name;
  const summary=new Fake('span');summary.textContent=preview;
  return {
    dataset:{unread:String(unread),contactPinned:pinned},
    querySelector:s=>{
      if(s==='[data-contact-select]')return selected;
      if(s==='.shell-contact-name')return title;
      if(s==='.shell-contact-preview')return summary;
      return null;
    }
  };
}
const rows=[
 fakeRow('C Sâm pl','uuid-sam','Chị chuyển khoản rồi nhé',true),
 fakeRow('<script>','uuid-evil','Ảnh'),
 fakeRow('Báo cáo hệ thống','uuid-bank','Đối soát',false,'report')
];
const headerTrigger=new Fake('button');
const originalSettings=new Fake('button');
const doc={
  activeElement:null,
  createDocumentFragment:()=>new Fake('fragment'),
  createElement:tag=>new Fake(tag),
  querySelectorAll:selector=>selector==='#shellNavigationLayer [data-contact-row]'?rows:[],
  querySelector:selector=>selector==='[data-account-menu-settings]'?originalSettings:
    selector==='#regionTop [data-shell-command="sidebar.open"]'?headerTrigger:null
};
let menuClosed=0,unreadSync=0;
const scope={
  document:doc,window:{matchMedia:()=>({matches:true})},
  appShell:{dataset:{mobileDirectory:'true'}},
  authState:'AUTHENTICATED',
  activeContact:{id:'uuid-sam'},
  mobileChatDrawer:drawer,
  renderMenuUnread:()=>{unreadSync++;},
  closeAccountMenu:()=>{menuClosed++;}
};
vm.runInNewContext('let mobileChatDrawerOpen=false;\n'+section+
 '\nthis.actions={open:openMobileChatDrawer,close:closeMobileChatDrawer,toggle:toggleMobileChatDrawer,render:renderMobileChatDrawerRecents};',scope);
assert.equal(scope.actions.open(),true);
assert.equal(drawer.hidden,false);
assert.equal(drawer.dataset.open,'true');
assert.equal(drawer.attrs['aria-hidden'],'false');
assert.equal(recents.children.length,2,'pinned operational work must not masquerade as a chat');
assert.equal(recents.children[0].dataset.mobileDrawerContactId,'uuid-sam');
assert.equal(recents.children[0].dataset.active,'true');
assert.equal(recents.children[0].dataset.unread,'true');
assert.equal(recents.children[1].children[0].children[0].textContent,'<script>',
  'literal name text must never execute');
assert.equal(directory.focused,true);
assert.equal(settings.hidden,false);
assert.equal(scope.actions.close({restoreFocus:true}),true);
assert.equal(drawer.hidden,true);
assert.equal(drawer.attrs['aria-hidden'],'true');
assert.equal(headerTrigger.focused,true);
assert.equal(scope.actions.toggle(),true);
assert.equal(scope.actions.toggle(),true);
assert.equal(drawer.hidden,true);
assert(menuClosed>=2&&unreadSync>=3);
console.log('CHAT-396 mobile drawer contact routing/focus/backdrop/state PASS');
