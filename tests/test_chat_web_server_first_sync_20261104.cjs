'use strict';
// Incident 2026-11-04: Mac auth/heartbeat RPCs succeeded but the browser made
// no sidebar or sync-pull RPC after 08:04; iPhone kept receiving new messages.
// Canonical sidebar must render even if desktop IndexedDB stalls on boot/write.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
const idle=()=>new Promise(()=>{});
async function flush(){for(let i=0;i<100;i++)await Promise.resolve();}
function fixture({prune=async()=>false,write=async()=>true}={}){
 let auth={state:'GUEST',account:null,appSessionId:null,client:null};
 let contacts=[];
 const calls=[],repaints=[],listeners={};
 const on=(event,fn)=>(listeners[event]||(listeners[event]=[])).push(fn);
 const emit=(event,detail)=>{for(const fn of listeners[event]||[])fn({type:event,detail});};
 const cache={
  pruneAdminTestConversationCache:prune,
  open:async()=>true,
  listContacts:async()=>[{id:'cached',display_name:'OUTDATED',latest_at:'2026-11-04T01:03:00Z'}],
  replaceContacts:write,
  setConversationId:async()=>true,
  isInitialized:async()=>true,
  getCursor:async()=>0,
  setCursor:async()=>true,
  listOutbox:async()=>[]
 };
 const ctx={
  window:null,console,Map,Set,Array,Object,String,Number,Boolean,Date,Math,JSON,Promise,Blob,
  navigator:{onLine:true},
  document:{addEventListener:on,dispatchEvent(e){emit(e.type,e.detail);return true;}},
  queueMicrotask(fn){Promise.resolve().then(fn);},setTimeout(){return 1;},clearTimeout(){},
  CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  V21CacheStore:cache,
  V21AuthSessionStore:{
   getClient:()=>auth.client,
   snapshot:()=>({state:auth.state,account:auth.account,appSessionId:auth.appSessionId})
  },
  V21ContactStore:{
   replace(rows){contacts=Array.from(rows);repaints.push(contacts.map(x=>x.id));},
   snapshot:()=>contacts,
   clear(){contacts=[]}
  },
  V21MessageStore:{reset(){},setContext(){},replace(){},stashCurrentView(){},restoreSession(){return null;}},
  ChatAppShell:{snapshot(){return{route:'chat',sidebarOpen:false,activeContact:null};},UnreadIndicator:{set(){},snapshot(){return 0;}}}
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 function login(account,resolveRpc=null){
  auth={state:'AUTHENTICATED',account:{id:account},appSessionId:'s-'+account,client:{
   rpc(name,args){
    calls.push({account,name,args});
    if(name==='v21_contacts_sidebar'){
     if(resolveRpc)return resolveRpc(name,args);
     return Promise.resolve({data:[{id:account+'-new',display_name:'NEW',latest_at:'2026-11-04T15:09:31Z'}],error:null});
    }
    return Promise.resolve({data:[],error:null});
   }
  }};
  emit('v21-auth-state',{state:'AUTHENTICATED'});
 }
 return{ctx,login,calls,repaints,rows:()=>contacts,emit};
}
(async()=>{
 // A blocked cleanup used to prevent any canonical contacts RPC entirely.
 const stalled=fixture({prune:idle});
 stalled.login('A');await flush();
 assert.equal(stalled.calls.filter(x=>x.name==='v21_contacts_sidebar').length,1,
   'the fresh canonical RPC must start before offline cache cleanup');
 assert.equal(stalled.rows()[0]?.id,'A-new','fresh server sidebar renders despite blocked IndexedDB boot');

 // Even if writing the new contacts back to cache stalls, UI is immediately fresh.
 const writeStall=fixture({prune:idle,write:idle});
 writeStall.login('B');await flush();
 assert.equal(writeStall.rows()[0]?.id,'B-new','cannot wait for IndexedDB persistence before painting');
 assert.equal(writeStall.repaints.length,1);

 // Response from a stale login may not repaint the next account.
 const resolvers={};
 const change=fixture({prune:idle});
 change.login('A',()=>new Promise(resolve=>{resolvers.A=resolve;}));
 await flush();
 change.login('B');await flush();
 assert.equal(change.rows()[0]?.id,'B-new');
 resolvers.A({data:[{id:'A-late',display_name:'STALE'}],error:null});
 await flush();
 assert.equal(change.rows()[0]?.id,'B-new','old account may not flash on new account');
 assert.equal(change.repaints.some(row=>row.includes('A-late')),false);
 console.log('CHAT web server-first canonical contacts survive stalled IndexedDB + auth rotation PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
