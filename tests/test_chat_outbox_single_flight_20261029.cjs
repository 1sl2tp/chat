'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function drain(){for(let i=0;i<40;i++)await Promise.resolve();}
function fixture(){
 let auth={state:'GUEST',account:null,appSessionId:null,client:null};
 const listeners=new Map(),listCalls=[],sendCalls=[],removed=[],updated=[];
 const gates={lists:new Map(),sends:new Map()};
 const rows={
  A:[{client_id:'client-A',contact_id:'contact-A',conversation_id:'conv-A',body:'one A message',created_at:'2026-10-29T01:00:00Z'}],
  B:[{client_id:'client-B',contact_id:'contact-B',conversation_id:'conv-B',body:'one B message',created_at:'2026-10-29T01:00:01Z'}]
 };
 const navigator={onLine:true};
 const document={
  addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a);},
  dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;}
 };
 const cache={
  async open(){return true;},async pruneAdminTestConversationCache(){return false;},
  async listContacts(){return[];},async isInitialized(){return true;},
  async getCursor(){return 0;},async listOutbox(account){
   listCalls.push(account);
   const g=gates.lists.get(account);
   if(g){g.started.resolve();await g.promise;}
   return rows[account].map(x=>({...x}));
  },
  async getConversationId(account){return 'conv-'+account;},
  async removeOutbox(account,id){removed.push({account,id});rows[account]=rows[account].filter(x=>x.client_id!==id);return true;},
  async updateOutbox(account,item){updated.push({account,id:item.client_id,failed:item.failed});return true;}
 };
 let serial=0;
 const ctx={
  console,window:null,document,navigator,Blob,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Promise,
  queueMicrotask(){},setTimeout(){return 1;},clearTimeout(){},
  CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  V21AuthSessionStore:{snapshot(){return{state:auth.state,account:auth.account,appSessionId:auth.appSessionId};},getClient(){return auth.client;}},
  V21CacheStore:cache,
  V21ContactStore:{replace(){},snapshot(){return[];},clear(){}},
  V21MessageStore:{reset(){},replace(){},setContext(){},restoreSession(){return null;},apply(){}},
  ChatAppShell:{snapshot(){return{route:'chat',sidebarOpen:true,activeContact:null};},UnreadIndicator:{snapshot(){return 0;},set(){}}}
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 function clientFor(account,session){
  const clientId=++serial;
  return{clientId,async rpc(name,args){
   if(name==='v21_message_send'||name==='v21_message_reply_send'){
    sendCalls.push({account,session,clientId,name,args});
    const g=gates.sends.get(account);
    if(g){g.started.resolve();return g.promise;}
    return{data:null,error:null};
   }
   if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
   return{data:[],error:null};
  }};
 }
 async function login(account,session){
  auth={state:'AUTHENTICATED',account:{id:account},appSessionId:session,client:clientFor(account,session)};
  navigator.onLine=false;
  document.dispatchEvent({type:'v21-auth-state',detail:{state:'AUTHENTICATED'}});
  await drain();navigator.onLine=true;
  assert.equal(ctx.V21SyncEngine.snapshot().accountId,account);
 }
 function hold(map,key){
  const started=deferred(),blocked=deferred();
  map.set(key,{started,promise:blocked.promise});
  return{started:started.promise,release:blocked.resolve};
 }
 return{engine:ctx.V21SyncEngine,login,hold,gates,listCalls,sendCalls,removed,updated};
}
async function coalesceAtList(){
 const f=fixture();await f.login('A','SA');
 const g=f.hold(f.gates.lists,'A');
 const a=f.engine.flushOutbox(),b=f.engine.flushOutbox(),c=f.engine.flushOutbox();
 assert.strictEqual(a,b,'same owner must share original in-flight Promise');
 assert.strictEqual(b,c);
 assert.equal(f.listCalls.length,1,'only one queued read');
 await g.started;g.release();
 assert.equal(await a,1);assert.equal(await b,1);assert.equal(await c,1);
 assert.equal(f.sendCalls.length,1,'only one canonical send per queued item');
 assert.equal(f.sendCalls[0].args.p_client_id,'client-A');
 assert.equal(f.removed.length,1,'only one outbox ACK removal');
 assert.equal(await f.engine.flushOutbox(),0,'next user action may start new drain after settle');
 assert.equal(f.listCalls.length,2);
}
async function coalesceAtRpc(){
 const f=fixture();await f.login('A','SA');
 const g=f.hold(f.gates.sends,'A');
 const a=f.engine.flushOutbox();
 await g.started;
 const b=f.engine.flushOutbox();
 assert.strictEqual(a,b,'same owner must reuse a pending network RPC');
 assert.equal(f.listCalls.length,1);
 assert.equal(f.sendCalls.length,1);
 g.release({data:null,error:null});
 assert.equal(await a,1);assert.equal(await b,1);
 assert.equal(f.removed.length,1);
}
async function rotatedAccountDoesNotJoinOrClearNewFlight(){
 const f=fixture();await f.login('A','SA');
 const aGate=f.hold(f.gates.lists,'A');
 const old=f.engine.flushOutbox();await aGate.started;
 await f.login('B','SB');
 const bGate=f.hold(f.gates.sends,'B');
 const fresh=f.engine.flushOutbox();await bGate.started;
 assert.notStrictEqual(old,fresh,'new owner must be able to start own flush');
 assert.equal(f.listCalls.filter(x=>x==='B').length,1);
 assert.equal(f.sendCalls.filter(x=>x.account==='B').length,1);
 aGate.release();assert.equal(await old,0,'old session must not process A item after switch');
 const joined=f.engine.flushOutbox();
 assert.strictEqual(joined,fresh,'A finalizer must not clear B flight');
 assert.equal(f.listCalls.filter(x=>x==='B').length,1);
 bGate.release({data:null,error:null});
 assert.equal(await fresh,1);assert.equal(await joined,1);
 assert.equal(f.removed.filter(x=>x.account==='B').length,1);
 assert.equal(f.removed.filter(x=>x.account==='A').length,0,'A pending row survives session rotation');
}
async function failedRpcCanBeRetriedNextFlight(){
 const f=fixture();await f.login('A','SA');
 const g=f.hold(f.gates.sends,'A');
 const a=f.engine.flushOutbox();
 await g.started;
 const b=f.engine.flushOutbox();assert.strictEqual(a,b);
 g.release({data:null,error:{code:'timeout',message:'temporary network failure',status:504}});
 assert.equal(await a,0);assert.equal(await b,0);
 assert.equal(f.sendCalls.length,1);
 assert.equal(f.removed.length,0,'failed delivery must remain pending, never removed');
 assert.equal(f.updated.length,1);
 await f.engine.flushOutbox();
 assert.equal(f.listCalls.length,2,'completed flight must release ownership for later retry');
}
(async()=>{
 await coalesceAtList();
 await coalesceAtRpc();
 await rotatedAccountDoesNotJoinOrClearNewFlight();
 await failedRpcCanBeRetriedNextFlight();
 console.log('CHAT outbox single-flight per owner concurrent list/send/rotation/retry PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
