'use strict';
// CHAT-442: Realtime owns first visible paint, IndexedDB is optional persistence.
// No network, login, real message or database writes; all dependencies are mocks.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const original=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
const marker='window.V21SyncEngine={';
assert.ok(original.includes(marker));
// Expose the private conversation selector in the isolated VM ONLY, not in the
// actual shipped script, so the test can verify an already-open chat.
const source=original.replace(marker,
 'window.__testSelectThread=(contact,conversation)=>{currentContactId=contact;currentConversationId=conversation;};\n'+marker);
const never=new Promise(()=>{});
const events={},renders={contacts:[],messages:[],merged:[]};
let rows=[];
let auth={state:'GUEST',account:null,appSessionId:null,client:null};
const initial={id:'contact-A',conversation_id:'conv-A',display_name:'Old name',
 preview_text:'Old preview',preview_kind:'text',latest_at:'2026-11-24T00:00:00Z',
 version:1,has_unread:false};
const cache={
 pruneAdminTestConversationCache:()=>never,
 listContacts:()=>never,
 getMessage:()=>never,
 upsertContact:()=>never,
 isInitialized:()=>true,
 getCursor:()=>Promise.resolve(0),
 listOutbox:()=>Promise.resolve([])
};
const contactStore={
 snapshot:()=>rows.map(x=>({...x})),
 replace(data){rows=data.map(x=>({...x}));renders.contacts.push(rows.map(x=>({...x})));},
 upsert(data){const i=rows.findIndex(x=>x.id===data.id);
  if(i>=0)rows[i]={...rows[i],...data};else rows.push({...data});
  renders.contacts.push(rows.map(x=>({...x})));
 },
 remove(id){rows=rows.filter(x=>x.id!==id)}
};
const ctx={
 window:null,console,Map,Set,Array,Object,String,Number,Boolean,Date,Math,JSON,Promise,Blob,
 navigator:{onLine:true},
 document:{
  addEventListener(type,fn){(events[type]||(events[type]=[])).push(fn);},
  dispatchEvent(event){for(const fn of events[event.type]||[])fn(event);return true;}
 },
 queueMicrotask(fn){Promise.resolve().then(fn);},
 setTimeout(){return 1;},clearTimeout(){},
 CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
 V21CacheStore:cache,
 V21AuthSessionStore:{getClient:()=>auth.client,snapshot:()=>auth},
 V21ContactStore:contactStore,
 V21MessageStore:{
  mergeForContact(message,scope){renders.merged.push({message,scope})},
  apply(message){renders.messages.push(message)}
 },
 ChatAppShell:{
  snapshot(){return{route:'chat',sidebarOpen:false,activeContact:{id:'contact-A'}};},
  UnreadIndicator:{set(){}}
 }
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(source,ctx);
async function flush(){for(let i=0;i<70;i++)await Promise.resolve();}
(async()=>{
 const client={
  rpc(name){if(name==='v21_contacts_sidebar')return Promise.resolve({data:[initial],error:null});
   return Promise.resolve({data:[],error:null});}
 };
 auth={state:'AUTHENTICATED',account:{id:'account-A',role:'admin'},
  appSessionId:'app-session-A',client};
 ctx.document.dispatchEvent(new ctx.CustomEvent('v21-auth-state',{detail:{state:'AUTHENTICATED'}}));
 await flush();
 assert.equal(rows.length,1,'server-first sidebar paints without local cache');
 ctx.__testSelectThread('contact-A','conv-A');

 const message={id:'message-new',conversation_id:'conv-A',sender_account_id:'sender-other',
  body:'New incoming message',created_at:'2026-11-24T00:02:00Z',
  version:2};
 const event={target_account_id:'account-A',entity_type:'message',entity_key:message.id,
  entity_version:2,op:'insert',payload:message};
 // Intentionally not awaiting: cache.getMessage() never completes.
 void ctx.V21SyncEngine.consumeRealtimeEvent(event);
 assert.equal(renders.messages.length,1,'open thread must repaint before IndexedDB');
 assert.equal(renders.messages[0].id,message.id);
 assert.equal(rows[0].preview_text,'New incoming message','directory preview must repaint before IndexedDB');
 assert.equal(rows[0].latest_at,message.created_at);
 assert.equal(rows[0].has_unread,false,'visible thread message remains read');

 const accountEvent={target_account_id:'account-A',entity_type:'account',
  entity_version:3,op:'update',payload:{id:'contact-A',display_name:'New name',version:3}};
 void ctx.V21SyncEngine.consumeRealtimeEvent(accountEvent);
 assert.equal(rows[0].display_name,'New name','contact metadata must repaint without waiting on listContacts');
 assert.equal(rows[0].preview_text,'New incoming message','partial account update must preserve latest message preview');
 assert.equal(rows[0].version,3);
 assert.equal(renders.merged.length,1);

 const staleMessage={...message,id:'old-message',body:'Older incoming',created_at:'2026-11-23T23:55:00Z'};
 void ctx.V21SyncEngine.consumeRealtimeEvent({...event,entity_key:staleMessage.id,payload:staleMessage});
 assert.equal(rows[0].preview_text,'New incoming message','older event cannot roll preview backwards');
 console.log('CHAT-442 open Web/PWA thread and directory paint without IndexedDB + scoped activity PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
