'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const original=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
const instrumented=original.replace(
 'window.V21SyncEngine={',
 'window.__mediaTest={markActiveMessageDirty,flushActiveMessageVisuals,setConversation(id){currentConversationId=id;},setContact(id){currentContactId=id;}};\nwindow.V21SyncEngine={'
);
assert.notEqual(instrumented,original,'test-only scoped function injection must remain valid');
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
function gate(account){const started=deferred(),stalled=deferred();return{account,started:started.promise,signal:started.resolve,promise:stalled.promise,release:stalled.resolve};}
async function drain(){for(let i=0;i<45;i++)await Promise.resolve();}
function asset(account,deleted=false){
 return {id:'asset-'+account,conversation_id:'conv-'+account,message_id:'msg-'+account,
  owner_account_id:account,kind:'image',file_name:'photo.png',size_bytes:8,
  created_at:'2026-10-29T08:00:00Z',updated_at:'2026-10-29T08:00:00Z',version:2,
  deleted_at:deleted?'2026-10-29T08:15:00Z':null};
}
function event(account,deleted=false){
 return{target_account_id:account,entity_type:'media',op:deleted?'delete':'insert',payload:asset(account,deleted)};
}
function fixture(){
 let auth={state:'GUEST',account:null,appSessionId:null,client:null};
 let contact=null,serial=0;
 const listeners=new Map(),writes=[],ui=[],wakes=[],rpc=[],gates={meta:null,remove:null,parentRead:null,parentWrite:null,index:null};
 const parents=new Map(),navigator={onLine:true};
 const cache={
  async open(){},async pruneAdminTestConversationCache(){return false;},async listContacts(){return[];},
  async getMessage(account,id){
   const g=gates.parentRead;if(g?.account===account){g.signal();await g.promise;}
   return parents.get(account+'|'+id)||null;
  },
  async putMessage(account,row){
   const g=gates.parentWrite;if(g?.account===account){g.signal();await g.promise;}
   writes.push({type:'parent',account,id:row.id,assets:(row._media_assets||[]).map(x=>x.id)});
   parents.set(account+'|'+row.id,row);
  },
  async upsertContact(account,row){writes.push({type:'contact',account,id:row.id});},
  async listOutbox(){return[];},async isInitialized(){return true;},
  async getCursor(){return 0;},async setCursor(){}
 };
 const media={
  async putRemoteMeta({accountId,assetId}){
   const g=gates.meta;if(g?.account===accountId){g.signal();await g.promise;}
   writes.push({type:'media-add',account:accountId,id:assetId});
  },
  async markDeleted({accountId,assetId}){
   const g=gates.remove;if(g?.account===accountId){g.signal();await g.promise;}
   writes.push({type:'media-delete',account:accountId,id:assetId});
  },
  async indexByMessage({accountId}){
   const g=gates.index;if(g?.account===accountId){g.signal();await g.promise;}
   return new Map();
  },
  async get({accountId,assetId}){
   wakes.push({account:accountId,id:assetId});return{blob:new Blob(['ok'])};
  },
  async ensureRemote(){throw Error('No binary download needed for in-memory fixture');}
 };
 const document={
  addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
  dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;}
 };
 const ctx={console,window:null,document,navigator,Blob,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Promise,
  queueMicrotask(){},setTimeout(){return 1;},clearTimeout(){},
  CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  V21AuthSessionStore:{
   snapshot(){return{state:auth.state,account:auth.account,appSessionId:auth.appSessionId};},
   getClient(){return auth.client;}
  },
  V21CacheStore:cache,V21MediaCache:media,
  V21ContactStore:{
   clear(){contact=null;},replace(){},snapshot(){return contact?[contact]:[];},
   upsert(row){ui.push({type:'contact',account:auth.account?.id,id:row.id});contact={...row};}
  },
  V21MessageStore:{
   reset(){},setContext(){},replace(){},restoreSession(){return null;},
   mergeForContact(row){ui.push({type:'merge-parent',account:auth.account?.id,id:row.id,assets:(row._media_assets||[]).map(x=>x.id)});},
   apply(row){ui.push({type:'render',account:auth.account?.id,id:row.id,assets:(row._media_assets||[]).map(x=>x.id)});}
  },
  ChatAppShell:{
   snapshot(){return{route:'chat',activeContact:null,sidebarOpen:true};},
   UnreadIndicator:{snapshot(){return 0;},set(){}}
  }
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(instrumented,ctx);
 function clientFor(account,session){
  const token=++serial;return{token,async rpc(name,args){
   rpc.push({account,session,token,name,args});
   if(name==='v21_unread_count')return{data:0,error:null};
   if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
   return{data:[],error:null};
  }};
 }
 async function login(account,session,{visible=false}={}){
  auth={state:'AUTHENTICATED',account:{id:account},appSessionId:session,client:clientFor(account,session)};
  contact={id:'contact-'+account,conversation_id:'conv-'+account,has_unread:false};
  if(!parents.has(account+'|msg-'+account))parents.set(account+'|msg-'+account,{
   id:'msg-'+account,conversation_id:'conv-'+account,body:'hello',sender_account_id:'OTHER',
   created_at:'2026-10-29T08:00:00Z',_media_assets:[]
  });
  navigator.onLine=false;
  document.dispatchEvent({type:'v21-auth-state',detail:{state:'AUTHENTICATED'}});
  await drain();navigator.onLine=true;
  ctx.__mediaTest.setConversation(visible?'conv-'+account:null);
  ctx.__mediaTest.setContact(visible?'contact-'+account:null);
  assert.equal(ctx.V21SyncEngine.snapshot().accountId,account);
 }
 return{engine:ctx.V21SyncEngine,debug:ctx.__mediaTest,login,writes,ui,wakes,rpc,gates,parents};
}
async function staleMediaMetadata(){
 const f=fixture();await f.login('A','SA',{visible:true});
 const g=f.gates.meta=gate('A');
 const pending=f.engine.consumeRealtimeEvent(event('A'));await g.started;
 await f.login('B','SB',{visible:true});g.release();
 assert.equal(await pending,false);
 assert.deepEqual(f.writes,[{type:'media-add',account:'A',id:'asset-A'}]);
 assert.equal(f.ui.length,0,'A media event cannot paint B');
 assert.equal(f.wakes.length,0,'stale media must not start B asset prewarm');
}
async function staleDeleteMetadata(){
 const f=fixture();await f.login('A','SA',{visible:true});
 const g=f.gates.remove=gate('A');
 const pending=f.engine.consumeRealtimeEvent(event('A',true));await g.started;
 await f.login('B','SB',{visible:true});g.release();
 assert.equal(await pending,false);
 assert.deepEqual(f.writes,[{type:'media-delete',account:'A',id:'asset-A'}]);
 assert.equal(f.ui.length,0);
}
async function staleParentReadSameAccountNewClient(){
 const f=fixture();await f.login('A','OLD',{visible:true});
 const g=f.gates.parentRead=gate('A');
 const pending=f.engine.consumeRealtimeEvent(event('A'));await g.started;
 await f.login('A','NEW',{visible:true});g.release();
 assert.equal(await pending,false);
 assert.equal(f.writes.filter(x=>x.type==='media-add').length,1);
 assert.equal(f.writes.some(x=>x.type==='parent'),false);
 assert.equal(f.ui.length,0,'old client cannot paint new client');
}
async function staleParentWrite(){
 const f=fixture();await f.login('A','SA',{visible:true});
 const g=f.gates.parentWrite=gate('A');
 const pending=f.engine.consumeRealtimeEvent(event('A'));await g.started;
 await f.login('B','SB',{visible:true});g.release();
 assert.equal(await pending,false);
 assert.equal(f.writes.some(x=>x.type==='parent'&&x.account==='A'),true);
 assert.equal(f.writes.some(x=>x.account==='B'),false);
 assert.equal(f.ui.length,0);
}
async function currentCreateDelete(){
 const f=fixture();await f.login('A','SA',{visible:true});
 assert.equal(await f.engine.consumeRealtimeEvent(event('A')),true);
 assert.equal(f.writes.some(x=>x.type==='media-add'&&x.account==='A'),true);
 assert.equal(f.ui.some(x=>x.type==='merge-parent'&&x.assets.includes('asset-A')),true);
 assert.equal(f.ui.some(x=>x.type==='render'&&x.assets.includes('asset-A')),true);
 assert.equal(await f.engine.consumeRealtimeEvent(event('A',true)),true);
 const parent=f.parents.get('A|msg-A');
 assert.equal(Array.isArray(parent._media_assets),true);
 assert.equal(parent._media_assets.length,0,'canonical deletion means explicit [] in parent read model');
 assert.equal(f.ui.some(x=>x.type==='merge-parent'&&x.assets.length===0),true);
 assert.equal(f.writes.some(x=>x.account!=='A'),false);
}
async function staleVisualIndex(){
 const f=fixture();await f.login('A','SA',{visible:true});
 f.debug.markActiveMessageDirty('msg-A','conv-A',{reconcileMedia:true});
 const g=f.gates.index=gate('A');
 const pending=f.debug.flushActiveMessageVisuals();await g.started;
 await f.login('B','SB',{visible:true});g.release();
 assert.equal(await pending,0);
 assert.equal(f.writes.length,0);
 assert.equal(f.ui.length,0);
}
async function staleVisualParentWrite(){
 const f=fixture();await f.login('A','SA',{visible:true});
 f.debug.markActiveMessageDirty('msg-A','conv-A');
 const g=f.gates.parentWrite=gate('A');
 const pending=f.debug.flushActiveMessageVisuals();await g.started;
 await f.login('B','SB',{visible:true});g.release();
 assert.equal(await pending,0);
 assert.equal(f.writes.every(x=>x.account==='A'),true);
 assert.equal(f.ui.length,0);
}
(async()=>{
 await staleMediaMetadata();
 await staleDeleteMetadata();
 await staleParentReadSameAccountNewClient();
 await staleParentWrite();
 await currentCreateDelete();
 await staleVisualIndex();
 await staleVisualParentWrite();
 console.log('CHAT realtime media owner fence: metadata, deletion, parent, visual race and valid [] PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
