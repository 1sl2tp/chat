'use strict';
// CHAT-NEXT-004 — gate and lifecycle validation without opening a real account,
// sending a message, touching Supabase, or collecting any customer payment.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const shell=fs.readFileSync('shell.js','utf8');
const admin=fs.readFileSync('admin-composer-actions.js','utf8');
const css=fs.readFileSync('chat-next-conversation.css','utf8');

function functionSource(src,name){
  const start=src.indexOf('function '+name+'(');
  assert(start>=0,'missing '+name);
  const open=src.indexOf('{',start);
  let depth=0;
  for(let i=open;i<src.length;i++){
    if(src[i]==='{')depth++;
    if(src[i]==='}'&&--depth===0)return src.slice(start,i+1);
  }
  throw Error('unclosed '+name);
}

const lifecycleStart=shell.indexOf('if(chatNextPreview){\n  document.addEventListener(\'chat-next-work-tools-force-close\'');
const lifecycleEnd=shell.indexOf('\nfunction renderTopTabs(){',lifecycleStart);
assert(lifecycleStart>=0&&lifecycleEnd>lifecycleStart,'candidate-only lifecycle listeners missing');
const lifecycle=shell.slice(lifecycleStart,lifecycleEnd);
assert(lifecycle.includes("document.addEventListener('focusin',event=>{"),'composer focus must close tools');
assert(lifecycle.includes("if(event.target?.id==='editor'&&appShell?.dataset.chatNextTools==='open')"),
  'only the live message editor should close the work bar');
assert(lifecycle.includes("narrowChatNext.addEventListener('change',closeOnBreakpoint);"),
  'narrow/desktop breakpoint must reset tools');
assert(lifecycle.includes("narrowChatNext.addListener(closeOnBreakpoint);"),
  'older Safari media-query change fallback');
assert(lifecycle.includes("document.addEventListener('chat-next-work-tools-force-close'"),
  'permission changes must cause a safe close');

const revokeBlock=functionSource(admin,'syncQuickActions');
assert(revokeBlock.includes("quickCustomerGroup()==='customer'"),'original customer group owner unchanged');
assert(revokeBlock.includes("bar.hidden=!visible;"),'original permission owner still controls hidden');
assert(revokeBlock.includes("if(document.getElementById('appShell')?.dataset.chatNextTools==='open')"),
  'do not broadcast revocation for default users');
assert(revokeBlock.includes("new Event('chat-next-work-tools-force-close')"),
  'notify candidate shell without a second permission engine');

function makeSandbox(preview){
  const handlers=new Map(),events=[];
  const trigger={setAttribute(_k,v){this.aria=v;},querySelector(q){
    return q==='[data-chat-next-tools-label]'?label:null;
  }};
  const label={textContent:'Hiện công việc'};
  const bar={hidden:false};
  const appShell={dataset:{chatNextTools:'closed',chatNextUi:preview?'on':'off'}};
  const media={matches:true,addEventListener(name,fn){if(name==='change')this.cb=fn;},
    addListener(fn){this.legacyCallback=fn;}};
  const document={
    querySelector(q){return q==='[data-chat-next-tools-toggle]'?trigger:null;},
    getElementById(q){return q==='chatQuickActions'?bar:q==='appShell'?appShell:null;},
    addEventListener(name,fn){
      const list=handlers.get(name)||[];list.push(fn);handlers.set(name,list);
    },
    dispatchEvent(e){events.push(e.type);for(const fn of handlers.get(e.type)||[])fn(e);}
  };
  const context={
    chatNextPreview:preview,appShell,document,
    window:{matchMedia:()=>media,ChatAppShell:{ScreenSession:{snapshot:()=>({route:'chat'})}}},
    Event:class{constructor(type){this.type=type;}},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    currentAdmin:()=>context.adminAllowed?{id:'admin'}:null,
    quickCustomerId:()=>context.contactId,
    quickCustomerGroup:()=>context.group,
    closeQuickRecent:()=>{context.recentClose+=1;},
    adminAllowed:true,contactId:'c1',group:'customer',recentClose:0
  };
  vm.createContext(context);
  vm.runInContext(functionSource(shell,'setChatNextToolsOpen')+'\n'+lifecycle+
    '\n'+revokeBlock,context);
  return {context,appShell,bar,document,media,events,handlers,trigger,label};
}

const x=makeSandbox(true);
assert.equal(x.handlers.get('focusin')?.length,1,'one focus guard in opt-in only');
assert.equal(x.handlers.get('chat-next-work-tools-force-close')?.length,1);
assert.equal(typeof x.media.cb,'function','breakpoint guard must be registered');

vm.runInContext('setChatNextToolsOpen(true)',x.context);
assert.equal(x.appShell.dataset.chatNextTools,'open');
x.document.dispatchEvent({type:'focusin',target:{id:'search-field'}});
assert.equal(x.appShell.dataset.chatNextTools,'open','search field must not close customer tools');
x.document.dispatchEvent({type:'focusin',target:{id:'editor'}});
assert.equal(x.appShell.dataset.chatNextTools,'closed','keyboard editor focus closes work tools');
assert.equal(x.label.textContent,'Hiện công việc');

vm.runInContext('setChatNextToolsOpen(true)',x.context);
x.media.cb();
assert.equal(x.appShell.dataset.chatNextTools,'closed','screen rotation closes stale tools');

vm.runInContext('setChatNextToolsOpen(true)',x.context);
vm.runInContext('syncQuickActions()',x.context);
assert.equal(x.appShell.dataset.chatNextTools,'open','allowed customer retains open state');
assert.equal(x.bar.hidden,false,'existing permission owner keeps customer tools eligible');

x.context.group='other';
vm.runInContext('syncQuickActions()',x.context);
assert.equal(x.bar.hidden,true);
assert.equal(x.appShell.dataset.chatNextTools,'closed','group permission revocation closes tools');
assert(x.events.includes('chat-next-work-tools-force-close'));
assert(x.events.includes('chat-next-work-tools-closed'));
assert(x.context.recentClose>=1,'existing Recent menu must close');

x.context.group='customer';
vm.runInContext('syncQuickActions()',x.context);
assert.equal(x.bar.hidden,false);
assert.equal(x.appShell.dataset.chatNextTools,'closed',
  'permission restoration cannot reopen the toolbar without another tap');
const before=x.events.length;
x.context.adminAllowed=false;
vm.runInContext('syncQuickActions()',x.context);
assert.equal(x.appShell.dataset.chatNextTools,'closed');
assert.equal(x.events.length,before,
  'candidate revocation is idempotent once its panel is closed');

const notOpted=makeSandbox(false);
assert.equal(notOpted.handlers.size,0,'default app cannot attach preview listeners');
assert.equal(notOpted.appShell.dataset.chatNextTools,'closed');
assert(!css.includes('position:fixed'),'no independent keyboard overlay owner');
console.log('CHAT NEXT phase-4 lifecycle: editor focus, breakpoint, customer permission revocation PASS');
