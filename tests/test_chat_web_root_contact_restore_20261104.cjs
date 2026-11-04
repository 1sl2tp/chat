'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

// CHAT-WEB-ROOT-RESTORE-20261104
// Browser #/chat is a route, not "clear current conversation".
// The PWA / and browser #/chat must honor the same account-scoped contact.
const root=path.join(__dirname,'..');
const shell=fs.readFileSync(path.join(root,'shell.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.source.html'),'utf8');
const routeStart=shell.indexOf('function explicitScreenRoute(){');
const routeEnd=shell.indexOf('function syncScreenRouteUrl(',routeStart);
const sessionStart=shell.indexOf('const ScreenSession={');
const sessionEnd=shell.indexOf('\nfunction renderMenuUnread()',sessionStart);
assert(routeStart>0&&routeEnd>routeStart,'route parser owner');
assert(sessionStart>0&&sessionEnd>sessionStart,'session owner');
const routeCode=shell.slice(routeStart,routeEnd);
const sessionCode=shell.slice(sessionStart,sessionEnd);
const contactId='11111111-1111-4111-8111-111111111111';
const anotherId='22222222-2222-4222-8222-222222222222';
function execute({hash='',stored={},id='account-A',query=''}={}){
  const events=[];
  const ctx={
    console,URLSearchParams,location:{hash,search:query},
    readScreenSession:accountId=>stored[accountId]||null,
    screenSessionKey:()=>null,
    syncDesktopSidebarMode:()=>events.push('desktop'),
    syncSidebarPresentation:()=>events.push('sidebar'),
    applyRoutePresentation:()=>events.push('render')
  };
  const script="let route='work', activeContact=null, sidebarOpen=true;\n"
   +routeCode+"\n"+sessionCode
   +"\nconst restored=ScreenSession.restore({id:"+JSON.stringify(id)+"});\n"
   +"({route,contact:activeContact,sidebarOpen,restored});";
  return {state:vm.runInNewContext(script,ctx),events};
}
const saved={activeContact:{id:contactId,name:'Liên hệ A'}};
test('desktop #/chat retains the selected contact instead of a blank thread',()=>{
 const {state,events}=execute({hash:'#/chat',stored:{'account-A':saved}});
 assert.equal(state.route,'chat');
 assert.deepEqual(JSON.parse(JSON.stringify(state.contact)),saved.activeContact);
 assert.equal(state.sidebarOpen,false);
 assert.deepEqual(events,['desktop','sidebar','render']);
});
test('installed PWA / without hash keeps the same account session',()=>{
 const {state}=execute({stored:{'account-A':saved}});
 assert.deepEqual(JSON.parse(JSON.stringify(state.contact)),saved.activeContact);
});
test('explicit same-contact deep-link keeps its scoped session',()=>{
 const {state}=execute({hash:'#/chat/'+contactId,stored:{'account-A':saved}});
 assert.equal(state.contact.id,contactId);
});
test('explicit other-contact link does not use unrelated saved contact',()=>{
 const {state}=execute({hash:'#/chat/'+anotherId,stored:{'account-A':saved}});
 assert.equal(state.contact,null);
});
test('photos route retains its own selection policy',()=>{
 const {state}=execute({hash:'#/photos',stored:{'account-A':saved}});
 assert.equal(state.route,'photos');
 assert.equal(state.contact,null);
});
test('another account cannot see a prior account session',()=>{
 const {state}=execute({hash:'#/chat',stored:{'account-A':saved},id:'account-B'});
 assert.equal(state.contact,null);
});
test('no saved conversation yields safe empty state, not a guessed read',()=>{
 const {state}=execute({hash:'#/chat',stored:{}});
 assert.equal(state.route,'chat');
 assert.equal(state.contact,null);
});
test('push intents remain owned by notification routing',()=>{
 const {state}=execute({hash:'#/chat',query:'?push_message_id=abc',stored:{'account-A':saved}});
 assert.deepEqual(JSON.parse(JSON.stringify(state.contact)),saved.activeContact);
});
test('empty desktop thread has guidance, no stale history action or new network owner',()=>{
 assert.match(shell,/appShell\.dataset\.chatContact=String\(Boolean\(activeContact\?\.id\)\)/);
 assert.match(html,/id="chatNoContactHint"[^>]*>Chọn một liên hệ trong Danh bạ/);
 assert.match(html,/#appShell\[data-auth-state="authenticated"\]\[data-route="chat"\]\[data-chat-contact="false"\] \.chat-no-contact-hint/);
 assert.match(html,/#appShell\[data-route="chat"\]\[data-chat-contact="false"\] #historyMoreWrap\{\s*display:none!important/);
 assert.doesNotMatch(sessionCode,/window\.V21SyncEngine\.(?:wake|syncContacts)\(/);
});
