'use strict';
// CHAT-442: an event whose apply resolved false must not suppress the existing
// single-flight delta recovery or prematurely cancel the raw-message fallback.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-realtime-session.js'),'utf8');

function fixture(consume){
 const handlers=new Map(),wakes=[],timers=new Map();
 let idCounter=0,channelCount=0;
 let account='account-A',session='session-A',visible=true;
 const channel={
  on(type,filter,handler){
   if(type==='postgres_changes')handlers.set(filter.table,handler);
   return this;
  },
  subscribe(fn){Promise.resolve().then(()=>fn('SUBSCRIBED'));return this;},
  async track(){return true;},
  async untrack(){return true;},
  presenceState(){return{};}
 };
 const client={
  realtime:{isConnected:()=>true},
  channel(){channelCount++;return channel;},
  async removeChannel(){return true;}
 };
 const ctx={
  console,Promise,Map,Set,Array,Object,String,Number,Boolean,Date,Math,JSON,
  navigator:{onLine:true},
  document:{
   get hidden(){return !visible;},
   addEventListener(){},dispatchEvent(){return true;}
  },
  addEventListener(){},
  setTimeout(fn,ms){const id=++idCounter;timers.set(id,{fn,ms});return id;},
  clearTimeout(id){timers.delete(id);},
  setInterval(){return 1;},
  queueMicrotask(fn){Promise.resolve().then(fn);},
  CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  V21AuthSessionStore:{
   snapshot(){return{state:'AUTHENTICATED',account:{id:account},appSessionId:session};},
   getClient(){return client;},async syncRealtimeAuth(){return true;}
  },
  V21SyncEngine:{
   snapshot(){return{currentConversationId:null};},
   async wake({reason}){wakes.push(reason);return true;},
   consumeRealtimeEvent:consume
  },
  ChatAppShell:{snapshot(){return{route:'chat'};}}
 };
 ctx.window=ctx;
 vm.createContext(ctx);
 vm.runInContext(source,ctx);
 async function flush(){for(let i=0;i<90;i++)await Promise.resolve();}
 const raw=id=>handlers.get('v21_messages')({new:{id}});
 const canonical=(id,entityType='message')=>handlers.get('v21_sync_events')({
  new:{target_account_id:account,entity_type:entityType,entity_key:id,payload:{id}}
 });
 function runTimers(delay){for(const [id,t] of [...timers])if(t.ms===delay){timers.delete(id);t.fn();}}
 return{ctx,raw,canonical,flush,runTimers,wakes,timers,handlers,channelCount:()=>channelCount};
}
(async()=>{
 const missed=fixture(()=>Promise.resolve(false));
 await missed.flush();
 assert.ok(missed.handlers.has('v21_sync_events'));
 assert.equal(missed.wakes.includes('realtime-subscribed'),true);
 missed.wakes.length=0;
 missed.raw('message-missed');
 missed.canonical('message-missed');
 await missed.flush();
 assert.deepEqual(missed.wakes,['realtime-direct-unapplied'],
  'resolved false must schedule one canonical delta recovery, even without rejection');
 missed.runTimers(250);
 await missed.flush();
 assert.deepEqual(missed.wakes,
  ['realtime-direct-unapplied','realtime-message-fallback'],
  'an unapplied canonical event must not cancel its raw-message fallback');

 const covered=fixture(()=>Promise.resolve(true));
 await covered.flush();
 covered.wakes.length=0;
 covered.raw('message-handled');
 covered.canonical('message-handled');
 await covered.flush();
 covered.runTimers(250);
 await covered.flush();
 assert.deepEqual(covered.wakes,[],'handled canonical event clears only its pending fallback');

 const error=fixture(()=>Promise.reject(new Error('mock local storage failure')));
 await error.flush();
 error.wakes.length=0;
 error.canonical('message-error');
 await error.flush();
 assert.deepEqual(error.wakes,['realtime-direct-failed']);

 let settle=null;
 const delayed=fixture(()=>new Promise(resolve=>{settle=resolve;}));
 await delayed.flush();
 delayed.wakes.length=0;
 delayed.canonical('message-late');
 await delayed.ctx.V21RealtimeSession.stop();
 settle(false);
 await delayed.flush();
 assert.deepEqual(delayed.wakes,[],
   'retired subscription must not wake a new login after delayed apply');
 console.log('CHAT-442 live Realtime event promise, fallback and generation fencing PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
