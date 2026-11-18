'use strict';
// CHAT-NEXT-003: real opt-in customer tools state machine exercised in a
// detached DOM stub. This test must never run the app or send transactions.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const shell=fs.readFileSync('shell.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('chat-next-conversation.css','utf8');
const admin=fs.readFileSync('admin-composer-actions.js','utf8');
const app=fs.readFileSync('app.js','utf8');

function extract(name){
  const needle='function '+name+'(';
  const start=shell.indexOf(needle);
  assert(start>=0,'missing '+name);
  const open=shell.indexOf('{',start);
  let depth=0,end=-1;
  for(let i=open;i<shell.length;i++){
    if(shell[i]==='{')depth++;
    if(shell[i]==='}'&&--depth===0){end=i+1;break;}
    // Deliberately only parse the two small functions, which have no
    // object literals, template interpolation or braces in string constants.
  }
  assert(end>open,'incomplete '+name);
  return shell.slice(start,end);
}

assert(html.includes('data-chat-header-action="work-tools" data-chat-next-tools-toggle'),
  'new menu entry uses existing header action handler');
assert(html.includes('aria-controls="chatQuickActions" aria-expanded="false"'));
assert(html.includes('data-chat-next-tools-label>Hiện công việc'));
const actionEntries=(html.match(/data-chat-quick="(cash|debt|photos|recent)"/g)||[]);
assert.equal(actionEntries.length,4,'reuse precisely four existing customer quick actions');
assert(shell.includes("if(action==='work-tools'){\n      toggleChatNextTools();"));
assert(shell.includes("const bar=document.getElementById('chatQuickActions')"));
assert(shell.includes("!bar.hidden&&stage?.dataset.bankReportActive!=='true'"));
assert(shell.includes("if(previousRoute!==nextRoute)setChatNextToolsOpen(false);"),
  'route changes close the contextual tools');
assert(shell.includes("if(previousId!==(activeContact?.id||null))setChatNextToolsOpen(false);"),
  'customer switching closes contextual tools');
assert(shell.includes("if(presentation.state!=='idle'&&appShell?.dataset.chatNextTools==='open')setChatNextToolsOpen(false);"),
  'call transitions close contextual tools');
assert(shell.includes("    setChatNextToolsOpen(false);\n    if(appShell)appShell.dataset.authState="),
  'logout/auth changes close contextual tools');
assert(css.includes('#appShell .chat-next-work-menuitem {\n  display:none!important;'),
  'new item must not appear in default application');
assert(css.includes(':has(#stageLayout:not([data-bank-report-active="true"]) #chatQuickActions:not([hidden]))'),
  'menu item visibility follows the original quick-actions permission owner');
assert(css.includes('[data-chat-next-tools="closed"]'),'closed state must hide customer tools');
assert(css.includes('#chatQuickActions:not([hidden]) {\n    display:none!important;'),
  'hide existing toolbar, not a duplicate copy');
assert(!css.includes('position:fixed'),'no new overlay or viewport owner');
assert(!css.includes('grid-template-rows:'),'no message/scroll layout retuning');
assert(admin.includes("document.addEventListener('chat-next-work-tools-closed',closeQuickRecent);"),
  'recent dropdown cleanup belongs to original Admin action owner');
assert(app.includes("document.addEventListener('chat-next-tools-visibility-change',()=>{\n window.requestAnimationFrame(()=>updateMessageDayFloating());"),
  'floating day offset refresh is owned by message renderer');
assert(shell.includes('const WORK_ENABLED=false;'),'never silently enable disabled Work route');

const label={textContent:'Hiện công việc'};
const attrs={};
const trigger={setAttribute:(key,value)=>{attrs[key]=value;},querySelector:(q)=>q==='[data-chat-next-tools-label]'?label:null};
const bar={hidden:false};
const stage={dataset:{bankReportActive:'false'}};
const events=[];
const appShell={dataset:{chatNextUi:'on',chatNextTools:'closed'}};
const sandbox={
  appShell,chatNextPreview:true,authState:'AUTHENTICATED',
  authAccount:{role:'admin'},route:'chat',activeContact:{id:'customer-1'},callState:'IDLE',
  document:{
    querySelector:(q)=>q==='[data-chat-next-tools-toggle]'?trigger:null,
    getElementById:(q)=>q==='chatQuickActions'?bar:q==='stageLayout'?stage:null,
    dispatchEvent:(e)=>events.push(e.type)
  },
  window:{matchMedia:()=>({matches:true})},
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
  Event:class{constructor(type){this.type=type;}}
};
const fns=vm.runInNewContext(
  extract('setChatNextToolsOpen')+'\n'+extract('toggleChatNextTools')+
  '\n({setChatNextToolsOpen,toggleChatNextTools})',sandbox
);
assert.equal(fns.toggleChatNextTools(),true);
assert.equal(appShell.dataset.chatNextTools,'open');
assert.equal(attrs['aria-expanded'],'true');
assert.equal(label.textContent,'Ẩn công việc');
assert.deepEqual(events,['chat-next-tools-visibility-change']);

assert.equal(fns.toggleChatNextTools(),false);
assert.equal(appShell.dataset.chatNextTools,'closed');
assert.equal(attrs['aria-expanded'],'false');
assert.equal(label.textContent,'Hiện công việc');
assert.deepEqual(events.slice(1),['chat-next-tools-visibility-change','chat-next-work-tools-closed']);
const closedCount=events.length;
assert.equal(fns.setChatNextToolsOpen(false),false);
assert.equal(events.length,closedCount,'repeat close must be idempotent');

const blocked=[
  ()=>{sandbox.authAccount={role:'user'};},
  ()=>{sandbox.authAccount={role:'admin'};bar.hidden=true;},
  ()=>{bar.hidden=false;stage.dataset.bankReportActive='true';},
  ()=>{stage.dataset.bankReportActive='false';sandbox.callState='CONNECTED';},
  ()=>{sandbox.callState='IDLE';sandbox.route='photos';},
  ()=>{sandbox.route='chat';sandbox.chatNextPreview=false;}
];
for(const block of blocked){
  block();
  assert.equal(fns.toggleChatNextTools(),false,'context gating must block toolbar');
  assert.equal(appShell.dataset.chatNextTools,'closed');
}
sandbox.chatNextPreview=true;
assert.equal(fns.toggleChatNextTools(),true,'valid context restores on explicit tap');
assert.equal(fns.setChatNextToolsOpen(false),false);
console.log('CHAT NEXT phase 3 customer tools: permission, toggle, cleanup and isolation PASS');
