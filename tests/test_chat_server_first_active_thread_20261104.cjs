'use strict';
// Reproduce Nov 4 desktop failure: Auth/Call RPCs run, while the V21 indexed
// cache is stuck and no canonical directory or message hydrate can complete.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
const forever=new Promise(()=>{});
async function drain(){for(let i=0;i<120;i++)await Promise.resolve();}
const conversation='conv-gd',contact='gd-me-yeu';
const incoming=(id,at,body)=>({
 id,conversation_id:conversation,sender_account_id:'customer',
 body,created_at:at,updated_at:at,version:1,client_id:'client-'+id
});
function fixture({stall='prune'}={}){
 let account='admin',lastMessageAt='2026-11-04T15:09:31.362Z';
 let selectedContact=contact;
 let directory=[],thread=[],threadContext={currentContactId:null,currentConversationId:null};
 const listeners={},calls=[],threadApplies=[];
 const cache={
  open:async()=>true,
  pruneAdminTestConversationCache(){return stall==='prune'?forever:false;},
  listContacts:async()=>[],
  replaceContacts(){return stall==='write'?forever:Promise.resolve(true);},
  setConversationId:async()=>true,
  getConversationId(){return stall==='read'?forever:Promise.resolve(conversation);},
  listMessages:async()=>[],listOutboxForContact:async()=>[],listOutbox:async()=>[],
  isInitialized:async()=>true,getCursor:async()=>0,setCursor:async()=>true,
  getMessage(){return stall==='realtime'?forever:Promise.resolve(null);},
  putMessage(){return stall==='realtime'?forever:Promise.resolve(true);},
  upsertContact(){return stall==='realtime'?forever:Promise.resolve(true);}
 };
 const client={rpc(name){
  calls.push(name);
  if(name==='v21_contacts_sidebar')return Promise.resolve({
   data:[{id:contact,conversation_id:conversation,latest_at:lastMessageAt,
    display_name:'gd me yeu',version:1}],error:null
  });
  if(name==='v21_sync_snapshot')return Promise.resolve({
   data:{
    messages:[incoming('image-2209',lastMessageAt,'')],
    media_assets:[{id:'asset-2209',message_id:'image-2209',
      conversation_id:conversation,kind:'image',created_at:lastMessageAt,version:1}]
   },error:null
  });
  if(name==='v21_sync_pull')return Promise.resolve({data:{events:[],next_cursor:0,has_more:false},error:null});
  return Promise.resolve({data:0,error:null});
 }};
 const eventTarget={
  addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},
  dispatchEvent(event){for(const fn of listeners[event.type]||[])fn(event);return true;}
 };
 const ctx={
  console,document:eventTarget,navigator:{onLine:true},
  queueMicrotask(fn){Promise.resolve().then(fn);},
  setTimeout(){return 1;},clearTimeout(){},
  CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Promise,Blob,
  V21CacheStore:cache,
  V21AuthSessionStore:{
   snapshot(){return{state:'AUTHENTICATED',account:{id:account},appSessionId:'session-'+account};},
   getClient(){return client;}
  },
  ChatAppShell:{
   snapshot(){return{route:'chat',sidebarOpen:false,
    activeContact:selectedContact?{id:selectedContact,name:'gd me yeu'}:null};},
   UnreadIndicator:{set(){},snapshot(){return 0;}}
  },
  V21ContactStore:{
   snapshot(){return directory.map(x=>({...x}));},
   replace(rows){directory=Array.from(rows);},
   upsert(row){directory=directory.filter(x=>x.id!==row.id).concat(row);},
   clear(){directory=[];}
  },
  V21MessageStore:{
   snapshot(){return threadContext;},
   setContext({contactId,conversationId}){threadContext={currentContactId:contactId,currentConversationId:conversationId};},
   replace(rows){thread=Array.from(rows);return thread.length;},
   merge(rows){thread=thread.concat(rows);return thread.length;},
   mergeForContact(){return true;},
   apply(row){threadApplies.push(row);thread.push(row);return true;},
   reset(){thread=[];},stashCurrentView(){},restoreSession(){return null;},primeSession(){}
  }
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 function login(){eventTarget.dispatchEvent(new ctx.CustomEvent('v21-auth-state',{detail:{state:'AUTHENTICATED'}}));}
 return{
  login,calls,engine:ctx.window.V21SyncEngine,
  directory:()=>directory,thread:()=>thread,threadApplies,
  as(accountId){account=accountId;},
  setServerMessageAt(at){lastMessageAt=at;},
  emit(event){return ctx.window.V21SyncEngine.consumeRealtimeEvent(event);}
 };
}
(async()=>{
 for(const stall of ['prune','read','write']){
  const f=fixture({stall});
  f.login();await drain();
  assert.equal(f.directory()[0]?.latest_at,'2026-11-04T15:09:31.362Z',stall+' sidebar must show 22:09');
  assert.equal(f.thread()[0]?.id,'image-2209',stall+' selected thread must load without cache');
  assert.equal(f.thread()[0]?._media_assets?.[0]?.kind,'image',stall+' image metadata preserved');
  assert(f.calls.includes('v21_sync_snapshot'),stall+' canonical active snapshot required');
 }
 const f=fixture({stall:'realtime'});f.login();await drain();
 const at='2026-11-04T16:04:00.000Z';
 const pending=f.emit({target_account_id:'admin',entity_type:'message',op:'upsert',payload:incoming('new-2304',at,'Mới nhất')});
 await drain();
 assert.equal(f.directory()[0]?.latest_at,at,'inbox latest clock updates before cache getMessage');
 assert(f.threadApplies.some(x=>x.id==='new-2304'),'active conversation paints text without waiting for disk');
 // Pending durable write may remain stalled forever without preventing UI.
 assert(pending&&typeof pending.then==='function');
 const notOurs=f.emit({target_account_id:'other-account',entity_type:'message',
   op:'upsert',payload:incoming('wrong-owner','2026-11-04T16:10:00Z','NOT OUR DATA')});
 await notOurs;
 assert.equal(f.directory()[0]?.latest_at,at,'other account event is ignored');
 const mediaTime='2026-11-04T16:05:00.000Z';
 void f.emit({target_account_id:'admin',entity_type:'media',op:'upsert',payload:{
  id:'asset-2305',message_id:'new-2304',conversation_id:conversation,
  kind:'image',created_at:mediaTime,version:1
 }});
 await drain();
 assert.equal(f.directory()[0]?.latest_at,mediaTime,'media preview must not wait for disk');
 assert.equal(f.directory()[0]?.preview_text,'Ảnh');
 console.log('CHAT server-first selected thread + blocked realtime cache + account-fence PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
