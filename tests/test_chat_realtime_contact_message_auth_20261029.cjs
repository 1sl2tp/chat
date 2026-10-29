'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function tick(){for(let i=0;i<36;i++)await Promise.resolve();}
function hold(account){const start=deferred(),gate=deferred();return{account,start,promise:gate.promise,release:gate.resolve};}
function fixture(){
 let auth={state:'GUEST',account:null,appSessionId:null,client:null};
 let currentContact=null;
 const listeners=new Map(),writes=[],ui=[],rpc=[],gates={list:null,contactWrite:null,messageRead:null,messageWrite:null};
 const navigator={onLine:true};
 const cache={
  async open(){return true;},async pruneAdminTestConversationCache(){return false;},async listContacts(account){
   const gate=gates.list;if(gate?.account===account){gate.start.resolve();await gate.promise;}
   return[];
  },
  async upsertContact(account,row){
   const gate=gates.contactWrite;if(gate?.account===account){gate.start.resolve();await gate.promise;}
   writes.push({type:'contact',account,id:row.id});
  },
  async removeContact(account,id){writes.push({type:'contact-delete',account,id});},
  async getMessage(account,id){
   const gate=gates.messageRead;if(gate?.account===account){gate.start.resolve();await gate.promise;}
   return null;
  },
  async putMessage(account,row){
   const gate=gates.messageWrite;if(gate?.account===account){gate.start.resolve();await gate.promise;}
   writes.push({type:'message',account,id:row.id});
  },
  async removeMessage(account,id){writes.push({type:'message-delete',account,id});},
  async isInitialized(){return true;},async listOutbox(){return[];},
  async getCursor(){return 0;},async setCursor(){return true;}
 };
 const document={
  addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
  dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;}
 };
 const ctx={
  console,window:null,document,navigator,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Promise,Blob,
  queueMicrotask(){},setTimeout(){return 1;},clearTimeout(){},
  CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  V21AuthSessionStore:{
   snapshot(){return{state:auth.state,account:auth.account,appSessionId:auth.appSessionId};},
   getClient(){return auth.client;}
  },
  V21CacheStore:cache,
  V21ContactStore:{
   replace(){},clear(){},snapshot(){return currentContact?[currentContact]:[];},
   upsert(row){ui.push({type:'contact',account:auth.account?.id,id:row.id});currentContact={...row};},
   remove(id){ui.push({type:'delete',account:auth.account?.id,id});}
  },
  V21MessageStore:{
   reset(){},replace(){},setContext(){},restoreSession(){return null;},
   mergeForContact(row){ui.push({type:'merge-message',account:auth.account?.id,id:row.id});},
   apply(row){ui.push({type:'message',account:auth.account?.id,id:row.id});},
   remove(id){ui.push({type:'remove-message',account:auth.account?.id,id});}
  },
  ChatAppShell:{
   snapshot(){return{route:'chat',sidebarOpen:true,activeContact:null};},
   UnreadIndicator:{snapshot(){return 0;},set(){}}
  }
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 let seq=0;
 function clientFor(account,session){
  const id=++seq;
  return{async rpc(name,args){
   rpc.push({name,account,session,id,args});
   if(name==='v21_unread_count')return{data:0,error:null};
   if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
   return{data:[],error:null};
  }};
 }
 async function login(account,session){
  auth={state:'AUTHENTICATED',account:{id:account},appSessionId:session,client:clientFor(account,session)};
  currentContact={id:'contact-'+account,conversation_id:'conv-'+account,has_unread:true};
  navigator.onLine=false;
  document.dispatchEvent({type:'v21-auth-state',detail:{state:'AUTHENTICATED'}});
  await tick();navigator.onLine=true;
  assert.equal(ctx.V21SyncEngine.snapshot().accountId,account);
 }
 return{engine:ctx.V21SyncEngine,login,gates,writes,ui,rpc,contact:()=>currentContact};
}
function contactEvent(account,version=1){return{
 target_account_id:account,entity_type:'account',op:'update',entity_version:version,
 payload:{id:'contact-'+account,conversation_id:'conv-'+account,display_name:'from '+account,version}
};}
function messageEvent(account,version=1){return{
 target_account_id:account,entity_type:'message',op:'insert',entity_version:version,
 payload:{id:'msg-'+account,conversation_id:'conv-'+account,sender_account_id:'OTHER',body:'hello '+account,created_at:'2026-10-29T05:00:00Z',version}
};}
async function staleContactList(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.list=hold('A');
 const pending=f.engine.consumeRealtimeEvent(contactEvent('A'));await g.start.promise;
 await f.login('B','SB');g.release();
 assert.equal(await pending,false);
 assert.equal(f.writes.length,0);
 assert.equal(f.ui.length,0);
 assert.equal(await f.engine.consumeRealtimeEvent(contactEvent('B')),true);
 assert.equal(f.writes[0].account,'B');
 assert.deepEqual(f.ui,[{type:'contact',account:'B',id:'contact-B'}]);
}
async function staleContactWrite(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.contactWrite=hold('A');
 const pending=f.engine.consumeRealtimeEvent(contactEvent('A'));await g.start.promise;
 await f.login('B','SB');g.release();
 assert.equal(await pending,false);
 assert.deepEqual(f.writes,[{type:'contact',account:'A',id:'contact-A'}]);
 assert.equal(f.ui.length,0);
}
async function queuedEventSameAccountNewClient(){
 const f=fixture();await f.login('A','OLD');
 const g=f.gates.list=hold('A');
 const first=f.engine.consumeRealtimeEvent(contactEvent('A',1));await g.start.promise;
 const second=f.engine.consumeRealtimeEvent(contactEvent('A',2));
 await f.login('A','NEW');g.release();
 assert.equal(await first,false);
 assert.equal(await second,false,'queued A/OLD event must not replay in A/NEW client');
 assert.equal(f.ui.length,0);
 assert.equal(f.writes.length,0);
}
async function staleMessageRead(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.messageRead=hold('A');
 const pending=f.engine.consumeRealtimeEvent(messageEvent('A'));await g.start.promise;
 await f.login('B','SB');g.release();
 assert.equal(await pending,false);
 assert.equal(f.writes.length,0);
 assert.equal(f.ui.length,0);
 assert.equal(f.rpc.filter(x=>x.name==='v21_unread_count').length,0);
}
async function staleMessageWrite(){
 const f=fixture();await f.login('A','SA');
 const g=f.gates.messageWrite=hold('A');
 const pending=f.engine.consumeRealtimeEvent(messageEvent('A'));await g.start.promise;
 await f.login('B','SB');g.release();
 assert.equal(await pending,false);
 assert.deepEqual(f.writes,[{type:'message',account:'A',id:'msg-A'}]);
 assert.equal(f.ui.length,0);
 assert.equal(f.rpc.filter(x=>x.name==='v21_unread_count').length,0);
}
async function currentMessage(){
 const f=fixture();await f.login('B','SB');
 assert.equal(await f.engine.consumeRealtimeEvent(messageEvent('B')),true);
 assert.deepEqual(f.writes.map(w=>({type:w.type,account:w.account,id:w.id})),[
  {type:'message',account:'B',id:'msg-B'},
  {type:'contact',account:'B',id:'contact-B'}
 ]);
 assert.equal(f.ui.some(x=>x.type==='merge-message'&&x.account==='B'),true);
 assert.equal(f.ui.some(x=>x.type==='contact'&&x.account==='B'),true);
 assert.equal(f.rpc.filter(x=>x.name==='v21_unread_count').length,1,
  'only a current message event may refresh global unread count');
 assert.equal(f.contact().has_unread,true);
}
(async()=>{
 await staleContactList();
 await staleContactWrite();
 await queuedEventSameAccountNewClient();
 await staleMessageRead();
 await staleMessageWrite();
 await currentMessage();
 console.log('CHAT realtime contact/message owner fence queued/client/read/write and active event PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
