'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const code=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
const shell=fs.readFileSync(path.join(__dirname,'..','shell.js'),'utf8');

function harness({warm=false,serverPaint=true}={}){
  const handlers=new Map();
  const phases=[];
  let releaseCache=null;
  const heldCache=new Promise(resolve=>{releaseCache=resolve;});
  let selected=null;
  let currentContactId=null;
  let currentConversationId=null;
  let serverSnapshotCount=0;
  const document={
    addEventListener(type,handler){const list=handlers.get(type)||[];list.push(handler);handlers.set(type,list);},
    dispatchEvent(event){
      if(event.type==='v21-conversation-switch')phases.push({phase:event.detail.phase,id:event.detail.contactId});
      for(const handler of handlers.get(event.type)||[])handler(event);
      return true;
    }
  };
  const messages={
    stashCurrentView(){},
    restoreSession(id){
      if(!warm)return null;
      currentContactId=id;currentConversationId='CONV';
      return {contactId:id,conversationId:'CONV',rows:1};
    },
    snapshot(){return {currentContactId,currentConversationId};},
    setContext({contactId,conversationId}){currentContactId=contactId;currentConversationId=conversationId;},
    replace(_rows,{contactId,conversationId}){currentContactId=contactId;currentConversationId=conversationId;},
    merge(_rows,{contactId,conversationId}){currentContactId=contactId;currentConversationId=conversationId;},
    primeSession(){},reset(){},apply(){},remove(){}
  };
  const cache={
    open:async()=>true,listContacts:async()=>[],getConversationId:()=>heldCache,
    listMessages:async()=>[],listOutboxForContact:async()=>[],
    getMeta:async()=>false,setMeta:async()=>true,setConversationId:async()=>true,
    isInitialized:async()=>true,getCursor:async()=>0,setCursor:async()=>true,
    putMessages:async()=>true,replaceContacts:async()=>true,
    putReadState:async()=>true,putMessage:async()=>true,listOutbox:async()=>[]
  };
  const client={rpc:async name=>{
    if(name==='v21_sync_snapshot'){
      serverSnapshotCount++;
      return serverPaint
        ? {data:{messages:[{id:'msg-1',client_id:'client-1',conversation_id:'CONV',
            sender_account_id:'CUSTOMER',body:'Tin mới',created_at:'2026-11-18T13:00:00Z'}],
            media_assets:[]},error:null}
        : {data:null,error:new Error('network unavailable')};
    }
    if(name==='v21_contacts_sidebar')return{data:[],error:null};
    if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
    if(name==='v21_unread_count')return{data:0,error:null};
    if(name==='v21_mark_read')return{data:true,error:null};
    return{data:null,error:null};
  }};
  const ctx={console,window:null,document,CustomEvent,Blob,Map,Set,Array,Object,
    String,Number,Boolean,Date,JSON,Math,navigator:{onLine:true},
    queueMicrotask,setTimeout,clearTimeout};
  ctx.window=ctx;
  ctx.V21AuthSessionStore={
    snapshot:()=>({state:'AUTHENTICATED',appSessionId:'SESSION',account:{id:'ADMIN',role:'admin'}}),
    getClient:()=>client
  };
  ctx.V21CacheStore=cache;
  ctx.V21MediaCache={indexByMessage:async()=>new Map(),listForMessage:async()=>[],
    ensureRemote:async()=>null,get:async()=>null};
  ctx.V21MessageStore=messages;
  ctx.V21ContactStore={snapshot:()=>[{id:'CUSTOMER',conversation_id:'CONV'}],
    replace(){},clear(){}};
  ctx.ChatAppShell={snapshot:()=>({route:'chat',sidebarOpen:false,
    activeContact:selected?{id:selected}:null}),
    UnreadIndicator:{snapshot:()=>0,set(){}}};
  vm.createContext(ctx);
  vm.runInContext(code,ctx);
  return {ctx,phases,select(id){selected=id;},releaseCache,
    snapshots:()=>serverSnapshotCount};
}

test('warm conversation mounts from memory without waiting for IndexedDB',async()=>{
  const h=harness({warm:true,serverPaint:false});
  await new Promise(resolve=>setTimeout(resolve,0));
  h.select('CUSTOMER');
  const open=h.ctx.V21SyncEngine.openContact('CUSTOMER');
  assert.equal(h.phases[0]?.phase,'start');
  assert(h.phases.some(event=>event.phase==='mounted'&&event.id==='CUSTOMER'),
    'restored in-memory thread should release the gate synchronously');
  // The IndexedDB read is still unresolved; the screen is already mounted.
  h.releaseCache('CONV');
  await open;
  assert.equal(h.phases.filter(event=>event.phase==='mounted').length,1,
    'late cache read must not mount the same contact twice');
});

test('cold conversation mounts after canonical server paint even if IndexedDB stalls',async()=>{
  const h=harness({warm:false});
  await new Promise(resolve=>setTimeout(resolve,0));
  h.select('CUSTOMER');
  const open=h.ctx.V21SyncEngine.openContact('CUSTOMER');
  assert.equal(h.phases[0]?.phase,'start');
  for(let i=0;i<6&&!h.phases.some(event=>event.phase==='mounted');i++)
    await Promise.resolve();
  assert(h.snapshots()>0,'server snapshot should start before cache hydration');
  assert(h.phases.some(event=>event.phase==='mounted'),
    'verified server-first paint releases switch gate without IndexedDB');
  h.releaseCache('CONV');
  await open;
  assert.equal(h.phases.filter(event=>event.phase==='mounted').length,1);
});

test('both list tap and push use canonical NavigationCommand.openContact',()=>{
  const tap=shell.slice(shell.indexOf("const contact=target.closest('[data-contact-select]');"));
  assert.match(tap,/NavigationCommand\.openContact\(contact\.dataset\.contactId,contact\.dataset\.contactName\)/);
  assert.doesNotMatch(tap.slice(0,240),/setActiveContact\(contact\.dataset\.contactId/);
});
