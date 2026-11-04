'use strict';
// Desktop may stay visible after switching other application windows. Verify
// that focus reconnects missed canonical activity without steady RPC polling.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-realtime-session.js'),'utf8');
const listeners={};
let clock=1000000,hidden=false,connected=true,channelCount=0,contactRefreshes=0;
let intervalCheck=null;
const wakes=[];
let owner='account-A',session='session-A';
class FakeDate extends Date{static now(){return clock;}}
const on=(key,fn)=>{(listeners[key]||(listeners[key]=[])).push(fn);};
const dispatch=(key,value={})=>{for(const fn of listeners[key]||[])fn(value);};
const client={
 realtime:{isConnected:()=>connected},
 channel(){
  channelCount++;
  return{
   on(){return this;},
   subscribe(fn){Promise.resolve().then(()=>fn('SUBSCRIBED'));return this;},
   async track(){return true;},
   async untrack(){return true;},
   presenceState(){return{};}
  };
 },
 async removeChannel(){return true;}
};
const ctx={
 console,Date:FakeDate,Promise,Map,Set,Array,Object,String,Number,Boolean,Math,JSON,
 navigator:{onLine:true},
 document:{
  get hidden(){return hidden;},
  addEventListener:on,
  dispatchEvent(){return true;}
 },
 addEventListener:on,
 setTimeout(){return 1;},clearTimeout(){},
 setInterval(fn){intervalCheck=fn;return 2;},clearInterval(){},
 queueMicrotask(fn){Promise.resolve().then(fn);},
 CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
 V21AuthSessionStore:{
  snapshot(){return{state:'AUTHENTICATED',account:{id:owner},appSessionId:session};},
  getClient(){return client;},
  async syncRealtimeAuth(){return true;}
 },
 V21SyncEngine:{
  snapshot(){return{currentConversationId:null};},
  async wake({reason}){wakes.push(reason);return true;},
  async syncContacts(){contactRefreshes++;return[];}
 },
 ChatAppShell:{snapshot(){return{route:'chat'};}}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(source,ctx);
async function flush(){for(let i=0;i<80;i++)await Promise.resolve();}
(async()=>{
 await flush();
 assert.equal(channelCount,1,'bootstrap subscribes once');
 assert.equal(typeof intervalCheck,'function','local socket health watchdog is installed');
 const bootWakes=wakes.length;
 dispatch('focus');await flush();
 assert.equal(contactRefreshes,1,'foreground web focus reconciles canonical directory');
 assert.equal(wakes.includes('window-focus'),true,'healthy web focus catches up deltas');
 assert.equal(channelCount,1,'healthy focus must not churn Realtime');
 dispatch('focus');await flush();
 assert.equal(contactRefreshes,1,'rapid focus events are coalesced');
 assert.equal(wakes.length,bootWakes+1,'focus debounce does not cause extra delta pull');
 intervalCheck();await flush();
 assert.equal(contactRefreshes,1,'healthy socket probe never polls directory');
 assert.equal(channelCount,1,'healthy transport is not restarted');
 clock+=46000;
 dispatch('focus');await flush();
 assert.equal(contactRefreshes,2,'later foreground focus gets fresh data');
 hidden=true;clock+=46000;
 dispatch('focus');intervalCheck();await flush();
 assert.equal(contactRefreshes,2,'hidden browser must not fetch contacts');
 assert.equal(channelCount,1,'hidden browser must not reconnect');
 hidden=false;connected=false;
 intervalCheck();await flush();
 assert.equal(channelCount,2,'silent disconnected socket gets bounded reconnect');
 assert.equal(contactRefreshes,2,'socket health probe does not poll contacts');
 connected=true;clock+=46000;
 owner='account-B';session='session-B';
 dispatch('focus');await flush();
 assert.equal(contactRefreshes,3,'new login is not blocked by older owner cooldown');
 console.log('CHAT desktop focus recovery and transport health without polling PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
