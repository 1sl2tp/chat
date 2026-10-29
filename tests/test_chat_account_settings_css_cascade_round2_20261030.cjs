'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const local=fs.readFileSync(path.join(root,'zalo-admin-link.css'),'utf8');
const later=fs.readFileSync(path.join(root,'mobile-ui-polish.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.source.html'),'utf8');
const js=fs.readFileSync(path.join(root,'zalo-admin-link.js'),'utf8');
const stripComments=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
const compact=s=>stripComments(s).replace(/\s+/g,'');
const a=compact(local),b=compact(later);

const settingsOrder=html.indexOf('href="./zalo-admin-link.css"');
const lateOrder=html.indexOf('href="./mobile-ui-polish.css"');
assert(settingsOrder>=0&&lateOrder>settingsOrder,
  'Regression must check the stylesheet that loads after the Settings owner');
// PR223's mobile row was one column, but this later sheet used !important
// to force two columns and shrank the input/buttons. No account settings
// owner selectors should remain in the late mobile styling sheet.
for(const selector of [
  '.zalo-account-card{','.zalo-account-modal{','.zalo-account-notification{',
  '.zalo-account-search{','.zalo-account-searchinput{','.zalo-account-list{',
  '.zalo-account-row{','.zalo-account-row-actions{','.zalo-account-action{',
  '.zalo-account-group-select{','.zalo-account-person{','.zalo-account-relation{'
]){
  assert(!b.includes(selector),'obsolete mobile override still owns '+selector);
}
assert(!b.includes('grid-template-columns:minmax(0,1fr)minmax(0,1fr)auto!important'),
  'late two-column override must not defeat narrow mobile composition');
assert(!b.includes('.zalo-account-searchinput{height:40px!important'),
  'late 14px search override must not defeat Safari-safe 16px input');
assert(!b.includes('mobile-ui-line)!important'), 
  'retired Settings rules should not be retained as local !important overrides');

// Every screen width under the existing max-width:640px breakpoint,
// including the user's ~500px content viewport and a 390px phone,
// uses one full-width row per Chat, Zalo, group selector and actions.
const mobilePos=a.indexOf('@media(max-width:640px){');
assert(mobilePos>=0,'existing mobile breakpoint must be preserved');
const mobile=a.slice(mobilePos);
assert(mobile.includes('.zalo-account-row{grid-template-columns:minmax(0,1fr);align-items:stretch;'));
assert(mobile.includes('.zalo-account-person::before{content:"Chat"}'));
assert(mobile.includes('.zalo-account-relation::before{content:"Zalo"}'));
assert(mobile.includes('.zalo-account-row-group{grid-column:1;align-self:center;'));
assert(mobile.includes('.zalo-account-row-actions{grid-column:1;justify-content:flex-start;'));
assert(mobile.includes('.zalo-account-action{min-height:40px}'));
assert(mobile.includes('.zalo-account-searchinput,.zalo-account-panelinput[type="search"],'));
assert(mobile.includes('.zalo-account-create-forminput:not([type="checkbox"]){font-size:16px}'));
assert(a.includes('.zalo-account-row{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr)minmax(0,1fr)auto;'),
  'desktop composition remains unchanged');

// The preferences region must reserve bounded positive height even when
// the directory contains hundreds of Chat and unassigned Zalo rows.
const pref=a.split('.zalo-account-preferences{')[1]?.split('}')[0]||'';
assert(pref.includes('flex:00auto;'), 'preferences must be flex-shrink:0');
assert(pref.includes('max-height:min(34svh,300px)'), 'settings remain viewport bounded');
assert(pref.includes('overflow-y:auto'), 'settings must remain independently scrollable');
const directory=a.split('.zalo-account-list{')[1]?.split('}')[0]||'';
assert(directory.includes('min-height:0;')&&directory.includes('flex:11auto;')&&directory.includes('overflow:auto'),
  'only directory list uses the leftover flex height');
assert(a.includes('.zalo-account-search{display:block;flex:00auto;'),
  'search and action remain pinned outside both scrolling regions');
assert(a.includes('height:calc(100dvh-16px)'));

// Existing shared account directory, Zalo create/link/unlink, group controls,
// device management and admin-only auth guard are untouched.
for(const term of ["action:'admin_snapshot'","action:'create_and_link'","action:'link'","action:'unlink'","data-zalo-account-unassigned"]){
  assert(js.includes(term),'existing Settings business contract lost '+term);
}
console.log('CHAT Account Settings round2 cross-stylesheet cascade and nonshrinking mobile layout PASS');
