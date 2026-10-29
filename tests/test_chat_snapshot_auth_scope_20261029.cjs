'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function drain(){for(let i=0;i<48;i++)await Promise.resolve();}
const snapshot=account=>({
  contacts:[{id:'contact-'+account,conversation_id:'conv-'+account,display_name:account+' private',version:1}],
  media_assets:[{id:'asset-'+account,conversation_id:'conv-'+account,message_id:'msg-'+account,owner_account_id:account,kind:'image',size_bytes:12}],
  messages:[{id:'msg-'+account,conversation_id:'conv-'+account,sender_account_id:account,body:'private '+account,version:1}],
  read_states:[{conversation_id:'conv-'+account,account_id:account,version:1}],
  server_cursor:25
});
function fixture(){
 let auth={state:'GUEST',account:null,appSessionId:null,client:null};
 const calls=[],writes=[],ui=[],gates={rpc:null,contacts:null,initialized:null};
 const listeners=new Map(),navigator={onLine:true};
 let clientSeq=0;
 const document={
  addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a);},
  dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;}
 };
 const cache={
  async pruneAdminTestConversationCache(){return false;},async open(){return true;},async listContacts(){return[];},
  async isInitialized(account){
   if(gates.initialized?.account===account){gates.initialized.started.resolve();await gates.initialized.promise;}
   return false;
  },
  async replaceContacts(account,rows){
   if(gates.contacts?.account===account){gates.contacts.started.resolve();await gates.contacts.promise;}
   writes.push({type:'contacts',account,ids:Array.from(rows,x=>x.id)});
  },
  async putMessages(account,rows){writes.push({type:'messages',account,ids:Array.from(rows,x=>x.id)});},
  async putReadState(account,row){writes.push({type:'read-state',account,id:row.conversation_id});},
  async setCursor(account,cursor){writes.push({type:'cursor',account,cursor});},
  async setInitialized(account,value){writes.push({type:'initialized',account,value});},
  async setMeta(account,key,value){writes.push({type:'meta',account,key,value});},
  async getCursor(){return 0;},async listOutbox(){return[];}
 };
 const media={async putRemoteMeta({accountId,assetId}){writes.push({type:'media',account:accountId,id:assetId});}};
 const ctx={
  console,window:null,document,navigator,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Promise,Blob,
  queueMicrotask(){},setTimeout(){return 1;},clearTimeout(){},
  CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  V21AuthSessionStore:{
   snapshot(){return{state:auth.state,account:auth.account,appSessionId:auth.appSessionId};},
   getClient(){return auth.client;}
  },
  V21CacheStore:cache,V21MediaCache:media,
  V21ContactStore:{
   replace(rows){ui.push({account:auth.account?.id,ids:Array.from(rows,x=>x.id)});},
   snapshot(){return[];},clear(){}
  },
  V21MessageStore:{reset(){},replace(){},setContext(){},restoreSession(){return null;},merge(){}},
  ChatAppShell:{snapshot(){return{route:'chat',sidebarOpen:true,activeContact:null};},UnreadIndicator:{snapshot(){return 0;},set(){}}}
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 function clientFor(account,session){
  const clientId=++clientSeq;
  return{
   clientId,
   async rpc(name,args){
    calls.push({name,account,session,clientId,args});
    if(name==='v21_sync_snapshot'){
     if(gates.rpc?.account===account&&gates.rpc.session===session){
      gates.rpc.started.resolve();return gates.rpc.promise;
     }
     return{data:snapshot(account),error:null};
    }
    if(name==='v21_unread_count')return{data:0,error:null};
    if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
    return{data:[],error:null};
   }
  };
 }
 async function login(account,session){
  auth={state:'AUTHENTICATED',account:{id:account},appSessionId:session,client:clientFor(account,session)};
  navigator.onLine=false;
  document.dispatchEvent({type:'v21-auth-state',detail:{state:'AUTHENTICATED'}});
  await drain();navigator.onLine=true;
  assert.equal(ctx.V21SyncEngine.snapshot().accountId,account);
 }
 function hold(account,session){
  const started=deferred(),wait=deferred();
  return{account,session,started,promise:wait.promise,release:wait.resolve};
 }
 return{engine:ctx.V21SyncEngine,gates,login,hold,calls,writes,ui};
}
async function staleSnapshotRpc(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.rpc=f.hold('A','SA');
 const old=f.engine.wake({reason:'test-startup-A'});
 await g.started.promise;
 await f.login('B','SB');
 g.release({data:snapshot('A'),error:null});
 await old;
 assert.equal(f.writes.some(w=>w.account==='A'),false,'old A RPC must not start a cache write');
 assert.equal(f.writes.some(w=>w.account==='B'&&w.ids?.some(id=>id.endsWith('-A'))),false,
  'A snapshot rows must never enter B cache');
 assert.equal(f.ui.some(u=>u.account==='B'&&u.ids.includes('contact-A')),false,
  'A snapshot must never render as B; a genuine B auth wake may sync B');
 assert.equal(f.calls.filter(c=>c.name==='v21_sync_snapshot'&&c.account==='A').length,1);
 await f.engine.wake({reason:'test-startup-B'});
 assert.deepEqual(f.ui.at(-1),{account:'B',ids:['contact-B']});
 assert.equal(f.writes.some(w=>w.account==='B'&&w.type==='initialized'),true);
 assert.equal(f.writes.some(w=>w.type==='contacts'&&w.ids.includes('contact-A')),false);
}
async function midWriteRotation(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.contacts=f.hold('A');
 const old=f.engine.wake({reason:'test-cache-race'});
 await g.started.promise;await f.login('B','SB');
 g.release();await old;
 assert.deepEqual(f.writes.filter(w=>w.account==='A'),[{type:'contacts',account:'A',ids:['contact-A']}],
  'in-progress A-only IDB put may finish but no further A mutations');
 assert.equal(f.writes.some(w=>w.account==='B'&&w.ids?.includes('contact-A')),false);
 assert.equal(f.ui.some(u=>u.account==='B'&&u.ids.includes('contact-A')),false);
}
async function sameAccountNewSession(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.rpc=f.hold('A','SA');
 const old=f.engine.wake({reason:'test-session-A'});await g.started.promise;
 await f.login('A','NEW');
 g.release({data:snapshot('A-STALE'),error:null});
 await old;
 assert.equal(f.writes.some(w=>w.ids?.includes('contact-A-STALE')),false,
  'rotated session must drop old response even if its new session can sync legitimately');
 assert.equal(f.ui.some(u=>u.ids.includes('contact-A-STALE')),false);
 await f.engine.wake({reason:'test-session-new'});
 assert.equal(f.writes.some(w=>w.type==='initialized'),true);
}
async function currentSnapshotPreserved(){
 const f=fixture();await f.login('A','SA');
 await f.engine.wake({reason:'current-account'});
 assert.deepEqual(f.ui,[{account:'A',ids:['contact-A']}]);
 assert.deepEqual(f.writes.map(x=>x.type),
  ['contacts','media','messages','read-state','cursor','initialized'],
  'current account still receives all existing canonical projections and cursor after cache writes');
 assert.equal(f.writes.every(x=>x.account==='A'),true);
 assert.equal(f.calls.filter(x=>x.name==='v21_sync_snapshot').length,1);
}
async function reconcileStaleRpc(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.rpc=f.hold('A','SA');
 const old=f.engine.recoverActiveFromSnapshot();await g.started.promise;
 await f.login('B','SB');g.release({data:snapshot('A'),error:null});
 assert.equal(await old,false);
 assert.equal(f.writes.length,0);
 assert.equal(f.ui.length,0);
 assert.equal(await f.engine.recoverActiveFromSnapshot(),true);
 assert.equal(f.ui.at(-1).ids[0],'contact-B');
 assert.equal(f.writes.some(w=>w.type==='cursor'),false,
  'conversation reconciliation must not modify durable sync cursor');
}
async function staleInitializedRead(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.initialized=f.hold('A');
 const old=f.engine.wake({reason:'initialization-guard'});await g.started.promise;
 await f.login('B','SB');g.release();await old;
 assert.equal(f.calls.some(x=>x.name==='v21_sync_snapshot'&&x.account==='A'),false,
  'obsolete doSync must not start A snapshot after its awaited initialized lookup');
 assert.equal(f.writes.some(w=>w.account==='B'&&w.ids?.includes('contact-A')),false,
  'a real B auth wake may run but must not receive A projection');
}
(async()=>{
 await staleSnapshotRpc();
 await midWriteRotation();
 await sameAccountNewSession();
 await currentSnapshotPreserved();
 await reconcileStaleRpc();
 await staleInitializedRead();
 console.log('CHAT snapshot owner fence RPC/IDB, same-account session, valid snapshot, reconcile PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
