'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function drain(){for(let i=0;i<40;i++)await Promise.resolve();}
function fixture(){
 let auth={state:'GUEST',account:null,appSessionId:null,client:null};
 const events=[],rpcCalls=[],updates=[],cacheSets=[],removed=[],success=[],failed=[];
 const listeners=new Map(),gates={get:null,open:null,send:null};
 const row={client_id:'outbox-A',contact_id:'CONTACT',conversation_id:null,body:'test',created_at:'2026-10-29T01:00:00Z',attempts:0};
 const cache={
  async pruneAdminTestConversationCache(){return false;},
  async open(){return true;},async listContacts(){return[];},
  async listOutbox(account){assert.equal(account,'A');return[{...row}]},
  async getConversationId(account,contact){
   if(gates.get){gates.get.started.resolve();return gates.get.promise;}
   return null;
  },
  async setConversationId(account,contact,conversation){cacheSets.push({account,contact,conversation});return true;},
  async updateOutbox(account,item){updates.push({account,item:{...item}});return true;},
  async putMessage(account,item){success.push({account,id:item.id});return true;},
  async removeMessage(account,id){removed.push({account,id});return true;},
  async removeOutbox(account,id){removed.push({account,id,kind:'outbox'});return true;},
  async isInitialized(){return true;},async getCursor(){return 0;},async listOutboxForContact(){return[];}
 };
 const document={
  addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
  dispatchEvent(e){events.push(e.type);for(const fn of listeners.get(e.type)||[])fn(e);return true;}
 };
 const navigator={onLine:true};
 const ctx={
  console,window:null,document,navigator,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Promise,Blob,
  queueMicrotask(){},setTimeout(){return 1;},clearTimeout(){},
  CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  V21AuthSessionStore:{
   snapshot(){return{state:auth.state,account:auth.account,appSessionId:auth.appSessionId};},
   getClient(){return auth.client;}
  },
  V21CacheStore:cache,V21ContactStore:{replace(){},snapshot(){return[];},clear(){}},
  V21MessageStore:{reset(){},setContext(){},replace(){},restoreSession(){return null;},apply(row){success.push({ui:auth.account?.id,id:row.id});}},
  ChatAppShell:{snapshot(){return{route:'chat',sidebarOpen:true,activeContact:null};},UnreadIndicator:{snapshot(){return 0;},set(){}}}
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 function client(account,session){
  return{async rpc(name,args){
   rpcCalls.push({account,session,name,args});
   if(name==='v21_conversation_open'){
    if(gates.open){gates.open.started.resolve();return gates.open.promise;}
    return{data:'CONV-A',error:null};
   }
   if(name==='v21_message_send'){
    if(gates.send){gates.send.started.resolve();return gates.send.promise;}
    return{data:null,error:null};
   }
   if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
   return{data:[],error:null};
  }};
 }
 async function login(account,session){
  auth={state:'AUTHENTICATED',account:{id:account},appSessionId:session,client:client(account,session)};
  navigator.onLine=false;document.dispatchEvent({type:'v21-auth-state',detail:{state:'AUTHENTICATED'}});
  await drain();navigator.onLine=true;
  assert.equal(ctx.V21SyncEngine.snapshot().accountId,account);
 }
 function hold(){
  const started=deferred(),waiting=deferred();
  return{started,promise:waiting.promise,release:waiting.resolve};
 }
 return{engine:ctx.V21SyncEngine,gates,hold,login,rpcCalls,updates,cacheSets,removed,success,failed,events};
}
async function lookupAThenAuthB(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.get=f.hold(),flush=f.engine.flushOutbox();
 await g.started.promise;
 await f.login('B','SB');g.release(null);
 assert.equal(await flush,0);
 assert.equal(f.rpcCalls.some(x=>x.name==='v21_conversation_open'),false,
  'A outbox must never invoke conversation_open under B after delayed lookup');
 assert.equal(f.updates.length,0);
 assert.equal(f.cacheSets.length,0);
}
async function rpcAThenAuthB(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.open=f.hold(),flush=f.engine.flushOutbox();
 await g.started.promise;await f.login('B','SB');
 g.release({data:'CONV-A',error:null});
 assert.equal(await flush,0);
 const opens=f.rpcCalls.filter(x=>x.name==='v21_conversation_open');
 assert.equal(opens.length,1);
 assert.equal(opens[0].account,'A','opening RPC must use captured A session');
 assert.equal(f.cacheSets.length,0,'no stale conversation cache commit after B switch');
 assert.equal(f.updates.length,0);
}
async function staleSendError(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.send=f.hold(),flush=f.engine.flushOutbox();
 await g.started.promise;await f.login('B','SB');
 g.release({data:null,error:{message:'network timeout',status:504}});
 assert.equal(await flush,0);
 assert.equal(f.rpcCalls.filter(x=>x.name==='v21_message_send').length,1);
 assert.equal(f.rpcCalls.filter(x=>x.name==='v21_message_send')[0].account,'A');
 assert.equal(f.updates.length,1,'only A conversationId was persisted before switch');
 assert.equal(f.updates[0].account,'A');
 assert.equal(f.updates.some(x=>x.item.failed),false,
  'stale error cannot mark old item terminal or send error to B');
 assert.equal(f.events.some(type=>type==='v21-media-outbox-error'),false);
}
async function sameOwnerSends(){
 const f=fixture();await f.login('A','SA');
 assert.equal(await f.engine.flushOutbox(),1);
 assert.equal(f.cacheSets.length,1);
 assert.equal(f.cacheSets[0].account,'A');
 assert.equal(f.rpcCalls.filter(x=>x.name==='v21_conversation_open').length,1);
 const sends=f.rpcCalls.filter(x=>x.name==='v21_message_send');
 assert.equal(sends.length,1);
 assert.equal(sends[0].args.p_client_id,'outbox-A',
  'persistent client_id must not change across retry');
 assert.equal(f.removed.some(x=>x.kind==='outbox'&&x.account==='A'),true);
}
(async()=>{
 await lookupAThenAuthB();
 await rpcAThenAuthB();
 await staleSendError();
 await sameOwnerSends();
 console.log('CHAT outbox owner lock: deferred lookup/open/send, current send idempotency PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
