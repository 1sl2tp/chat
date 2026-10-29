'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','v21-message-store.js'),'utf8');

const frames=[];
let capturedView={mode:'USER_AWAY',anchor:'old-message'};
const ctx={
  console,window:null,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,
  V21AuthSessionStore:{snapshot:()=>({state:'AUTHENTICATED',appSessionId:'S',account:{id:'ME'}})},
  V21ConversationBridge:{
    snapshot:()=>({size:0}),
    replace:(rows,{viewState}={})=>{
      frames.push({ids:rows.map(r=>r.id),viewState});
      return rows.length;
    },
    reconcile:(rows)=>({size:rows.length}),
    append:()=>true,captureViewState:()=>capturedView,
    clear:()=>true,remove:()=>true
  }
};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(code,ctx);
const api=ctx.V21MessageStore;
const row=(id,conv)=>({
  id,client_id:'client-'+id,sender_account_id:'ME',
  conversation_id:conv,body:'body-'+id,created_at:'2026-10-29T01:00:00Z',version:1
});
const old=row('old-message','OLD'),fresh=row('new-message','NEW'),
  fresh2=row('new-message-2','NEW'),bob=row('bob-message','BOB');
function lastFrame(){return frames.at(-1);}
function ids(){return lastFrame().ids;}
function restore(contact){assert.ok(api.restoreSession(contact));return lastFrame();}

assert.equal(api.primeSession({contactId:'Alice',conversationId:'OLD',rows:[old]}),true);
api.setContext({contactId:'Alice',conversationId:'OLD'});
assert.equal(api.stashCurrentView(),true);
assert.equal(api.primeSession({contactId:'Alice',conversationId:'OLD',rows:[],ifAbsent:true}),false,
  'repeated local hydration must not erase prior same-thread history');
assert.deepEqual(restore('Alice').viewState,{mode:'USER_AWAY',anchor:'old-message'});
assert.deepEqual(ids(),['old-message']);

assert.equal(api.merge([fresh],{contactId:'Alice',conversationId:'NEW'}),0,
  'late async merge cannot contaminate an existing OLD conversation');
assert.equal(api.mergeForContact(fresh,{contactId:'Alice',conversationId:'OLD'}),false,
  'realtime row and explicit conversation id must agree');
assert.equal(api.mergeForContact(fresh,{contactId:'Alice',conversationId:'NEW'}),false,
  'realtime NEW row cannot enter OLD session before canonical rotation');
assert.deepEqual(restore('Alice').ids,['old-message']);

assert.equal(api.primeSession({contactId:'Alice',conversationId:'NEW',rows:[fresh],ifAbsent:true}),true,
  'canonical contact conversation rotation must replace stale session');
assert.deepEqual(restore('Alice').ids,['new-message'],'OLD messages must not survive NEW rotation');
assert.equal(lastFrame().viewState,null,'OLD scroll position must not be reused in NEW thread');
assert.equal(api.mergeForContact(old,{contactId:'Alice',conversationId:'OLD'}),false);
assert.equal(api.mergeForContact(fresh2,{contactId:'Alice',conversationId:'NEW'}),true);
assert.deepEqual(restore('Alice').ids,['new-message','new-message-2']);
assert.equal(api.primeSession({contactId:'Alice',conversationId:'NEW',rows:[fresh],ifAbsent:true}),false,
  'same-conversation cache should not remove enriched rows');
assert.deepEqual(restore('Alice').ids,['new-message','new-message-2']);

assert.equal(api.primeSession({contactId:'Alice',conversationId:'NEW',rows:[old]}),false,
  'mixed explicit and row conversation must fail before overwrite');
assert.equal(api.merge([bob],{contactId:'Alice',conversationId:'NEW'}),0,
  'other-conversation row may not mutate active session');
assert.equal(api.mergeForContact(bob,{contactId:'Alice',conversationId:'NEW'}),false);
assert.deepEqual(restore('Alice').ids,['new-message','new-message-2']);

api.setContext({contactId:'Alice',conversationId:'NEW'});
capturedView={mode:'USER_AWAY',anchor:'new-message-2'};
assert.equal(api.stashCurrentView(),true);
api.replace([old],{contactId:'Alice',conversationId:'OLD'});
assert.deepEqual(restore('Alice').ids,['old-message']);
assert.equal(lastFrame().viewState,null,'replace to a different conversation resets old viewport');

assert.equal(api.primeSession({contactId:'Bob',conversationId:'BOB',rows:[bob]}),true);
assert.deepEqual(restore('Bob').ids,['bob-message']);
assert.deepEqual(restore('Alice').ids,['old-message'],
  'different contact session remains isolated');

console.log('CHAT contact/conversation cache affinity, async stale merge and view-state regression PASS');
