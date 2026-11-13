'use strict';
// CHAT PHONE QA round 1–2: real function behavior, privacy and UI contracts.
// No authenticated network call or customer data mutation in this test.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('contact-phone-admin.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const workflow=fs.readFileSync('.github/workflows/verify-v21.yml','utf8');

assert(src.includes('box-sizing:border-box;width:44px;height:44px;min-width:44px;min-height:44px;flex:0 0 44px'),
  'callback phone control needs same 44px target as Chat Call');
assert(src.includes('.call-focus-slot:not([data-call-ui-state="idle"]) .v21-phone-header-button{display:none!important}'),
  'phone callback action must not crowd an active call');
assert(src.includes('.v21-phone-close{box-sizing:border-box;width:44px;height:44px;'),
  'modal close needs 44px target');
assert(src.includes('.v21-phone-action{box-sizing:border-box;flex:1;min-width:108px;min-height:44px;'),
  'modal buttons need 44px targets');
assert(src.includes("panel.setAttribute('aria-labelledby','v21-phone-dialog-title')"));
assert(src.includes("heading.id='v21-phone-dialog-title'"));
assert(src.includes("overlay.addEventListener('keydown',event=>{"));
assert(src.includes("if(event.key!=='Escape')return;"));
assert(src.includes("close.addEventListener('click',()=>dismiss({restoreFocus:true}));"));
assert(src.includes("if(e.target===overlay)dismiss({restoreFocus:true})"));
assert(src.includes("if(!overlay.isConnected||!phoneContextActive(id,account))"));
assert(src.includes("document.addEventListener('v21-active-contact-change',()=>{dismiss();clearNotice();attach()});"));
assert(html.includes('data-call-focus-slot'));
assert(workflow.includes('node tests/test_call186_phone_header_modal_20261102.cjs'));

const start=src.indexOf('function dismiss(');
const end=src.indexOf('async function open(',start);
assert(start>0&&end>start,'extract real lifecycle functions');
let currentContact='contact-a',account='admin-a',isAdmin=true;
let removed=0,focused=0,overlayExists=true;
const overlay={remove(){removed++;overlayExists=false;}};
const opener={hidden:false,isConnected:true,focus(){focused++}};
const sandbox={
  document:{querySelector(selector){
    if(selector==='[data-v21-phone-overlay]')return overlayExists?overlay:null;
    if(selector==='[data-v21-phone-open]')return opener;
    throw new Error('unknown selector '+selector);
  }},
  modalOpener:null,
  admin:()=>isAdmin,
  au:()=>({account:{id:account}}),
  current:()=>({id:currentContact})
};
vm.runInNewContext(src.slice(start,end)+'\nthis.phoneTest={dismiss,phoneContextActive};',sandbox);
const {dismiss,phoneContextActive}=sandbox.phoneTest;
assert(phoneContextActive('contact-a','admin-a'));
assert(!phoneContextActive('contact-b','admin-a'),'no private data after contact change');
currentContact='contact-b';
assert(phoneContextActive('contact-b','admin-a'));
account='admin-b';
assert(!phoneContextActive('contact-b','admin-a'),'no cross-account stale cache');
isAdmin=false;
assert(!phoneContextActive('contact-b','admin-b'),'no user access');
isAdmin=true;
dismiss({restoreFocus:true});
assert.equal(removed,1);
assert.equal(focused,1,'keyboard/backdrop close returns focus to phone opener');
dismiss({restoreFocus:true});
assert.equal(focused,1,'closed overlay must not restore twice');
overlayExists=true;opener.hidden=true;
dismiss({restoreFocus:true});
assert.equal(focused,1,'hidden opener may not receive focus');
console.log('CHAT CALL-186 header, modal keyboard/focus and private phone context PASS');
