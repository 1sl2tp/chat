'use strict';
// NAV-284: visible iOS back chevron takes the user straight to Danh bạ.
// Menu remains available on the Danh bạ root; no login or Work regression.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const js=fs.readFileSync('work-customer-summary.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const css=fs.readFileSync('mobile-ui-polish.css','utf8');
function fn(name){
 const start=js.indexOf('function '+name+'(');
 assert(start>=0,'missing runtime owner '+name);
 const open=js.indexOf('{',start);
 let depth=0,end=-1;
 for(let i=open;i<js.length;i++){
  if(js[i]==='{')depth++;
  if(js[i]==='}'&&--depth===0){end=i+1;break;}
 }
 assert(end>open,'unclosed '+name);
 return js.slice(start,end);
}
const helper=fn('mobileHeaderReturnsToDirectory');
const back=fn('bindMobileNavigationClicks');
const updateAria=fn('syncMobileAccountMenuTrigger');
const show=fn('showMobileDirectory');
const hide=fn('hideMobileDirectory');
assert.match(helper,/snapshot\(\)\.state==='AUTHENTICATED'/);
assert.match(helper,/shellSnapshot\(\)\.route==='chat'/);
assert.match(helper,/!mobileDirectoryOpen\(\)/);
assert.match(helper,/Boolean\(activeContact\(\)\?\.id\)/);
assert.match(back,/showMobileDirectory\('header-back'\)/);
assert.match(back,/toggleMobileAccountMenu\(\)/);
assert.match(back,/event\.stopImmediatePropagation\(\)/);
assert.match(updateAria,/trigger\.setAttribute\('aria-label','Quay lại Danh bạ'\)/);
assert.match(updateAria,/trigger\.removeAttribute\('aria-haspopup'\)/);
assert.match(updateAria,/trigger\.removeAttribute\('aria-expanded'\)/);
assert.match(updateAria,/trigger\.removeAttribute\('aria-controls'\)/);
assert.match(updateAria,/delete trigger\.dataset\.mobileBack/);
assert.match(show,/navigation\(\)\?\.clearActiveContact\?\.\(\)/);
assert.match(show,/syncMobileAccountMenuTrigger\(false\)/);
assert.match(hide,/syncMobileAccountMenuTrigger\(false\)/);
assert.match(shell,/button\.dataset\.mobileBack==='true'/);
assert.match(css,/\.compact-top-grid:has\(\.top-mode-switch\[data-contact-identity="true"\]\)>\.shell-icon-button::before/);

// Exercise actual delegated production click handler, not a duplicate mock
// navigation algorithm. Element is a minimal test class, no browser/network.
class FakeElement{
 closest(selector){
  if(selector==='[data-shell-command="sidebar.open"]')return this;
  return null;
 }
}
function createScenario({authed=true,route='chat',selected=true,directory=false,mobile=true}={}){
 const listeners={};
 const events=[];
 const trigger=new FakeElement();
 const ctx={
  Element:FakeElement,
  document:{addEventListener:(type,callback)=>{listeners[type]=callback;}},
  mobileDirectoryAllowed:()=>mobile,
  mobileDirectoryOpen:()=>directory,
  snapshot:()=>({state:authed?'AUTHENTICATED':'GUEST'}),
  shellSnapshot:()=>({route}),
  activeContact:()=>selected?{id:'customer-1'}:null,
  showMobileDirectory:(reason)=>events.push('directory:'+reason),
  toggleMobileAccountMenu:()=>events.push('account-menu'),
  hideMobileDirectory:()=>{},
  closeMobileAccountMenu:()=>{},
  mobileAccountMenu:null,
  moveMobileAccountMenuFocus:()=>{},
  handleMobileTopTabTap:()=>{},
  Object,Boolean
 };
 vm.createContext(ctx);
 vm.runInContext(helper+'\n'+back+'\nbindMobileNavigationClicks();',ctx);
 let stopped=0,prevented=0;
 const event={target:trigger,preventDefault:()=>{prevented++},
  stopImmediatePropagation:()=>{stopped++}};
 listeners.click(event);
 return{events,stopped,prevented};
}
const chat=createScenario();
assert.deepEqual(chat.events,['directory:header-back']);
assert.equal(chat.stopped,1);
assert.equal(chat.prevented,1);
assert.deepEqual(createScenario({directory:true}).events,['account-menu']);
assert.deepEqual(createScenario({selected:false}).events,['account-menu']);
assert.deepEqual(createScenario({route:'work'}).events,['account-menu']);
assert.deepEqual(createScenario({authed:false}).events,['account-menu']);
assert.deepEqual(createScenario({mobile:false}).events,[]);
assert(!js.includes("showMobileDirectory('menu-button')"),
 'explicit account menu and directory remain separate owners');
console.log('NAV-284 mobile conversation back -> Danh bạ, directory menu preserved, guest/desktop safe PASS');
