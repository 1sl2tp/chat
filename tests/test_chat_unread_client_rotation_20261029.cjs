'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function drain(){for(let i=0;i<30;i++)await Promise.resolve();}
function fixture(){
  let auth={state:'GUEST',account:null,appSessionId:null,client:null};
  let badge=7,serial=0;
  const listeners=new Map(),calls=[],sets=[],timers=[],gates=new Map();
  const navigator={onLine:true};
  const document={
    addEventListener(type,fn){const arr=listeners.get(type)||[];arr.push(fn);listeners.set(type,arr);},
    dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);return true;}
  };
  const ctx={
    console,window:null,document,navigator,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Promise,Blob,
    queueMicrotask(){},
    setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},
    clearTimeout(){},
    V21AuthSessionStore:{
      snapshot(){return{state:auth.state,account:auth.account,appSessionId:auth.appSessionId};},
      getClient(){return auth.client;}
    },
    V21CacheStore:{
      async pruneAdminTestConversationCache(){return false;},
      async open(){return true;},async listContacts(){return[];},
      async isInitialized(){return true;},async getCursor(){return 0;},
      async listOutbox(){return[];}
    },
    V21ContactStore:{replace(){},snapshot(){return[];},clear(){}},
    V21MessageStore:{reset(){},setContext(){},replace(){},restoreSession(){return null;}},
    ChatAppShell:{
      snapshot(){return{route:'chat',sidebarOpen:true,activeContact:null};},
      UnreadIndicator:{
        snapshot(){return badge;},
        set(value){badge=value;sets.push({account:auth.account?.id,serial:auth.client?.serial,value});}
      }
    },
    CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}}
  };
  ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(source,ctx);
  function clientFor(account,session){
    const clientSerial=++serial;
    return{
      serial:clientSerial,
      async rpc(name,args){
        calls.push({name,account,session,clientSerial,args});
        if(name==='v21_unread_count'){
          if(gates.has(clientSerial)){const gate=gates.get(clientSerial);gate.started.resolve();return gate.promise;}
          return{data:2,error:null};
        }
        if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
        return{data:[],error:null};
      }
    };
  }
  async function login(account,session){
    auth={state:'AUTHENTICATED',account:{id:account},appSessionId:session,client:clientFor(account,session)};
    navigator.onLine=false;
    document.dispatchEvent({type:'v21-auth-state',detail:{state:'AUTHENTICATED'}});
    await drain();
    navigator.onLine=true;
    assert.equal(ctx.V21SyncEngine.snapshot().accountId,account);
    return auth.client.serial;
  }
  function gateClient(clientSerial){
    const started=deferred(),blocked=deferred();
    gates.set(clientSerial,{started,promise:blocked.promise});
    return{started:started.promise,release:blocked.resolve};
  }
  const count=()=>calls.filter(c=>c.name==='v21_unread_count').length;
  return{engine:ctx.V21SyncEngine,login,gateClient,sets,timers,calls,count,badge:()=>badge};
}
async function oldClientSameSession(){
  const f=fixture();
  const c1=await f.login('A','SA');
  const g=f.gateClient(c1);
  const old=f.engine.refreshUnread({force:true});
  await g.started;
  const c2=await f.login('A','SA');
  assert.notEqual(c1,c2,'same account/session can replace client instance');
  g.release({data:99,error:null});
  assert.equal(await old,7,'old client must return last-good badge, not stale 99');
  assert.equal(f.badge(),7);
  assert.equal(f.sets.length,0);
  assert.equal(f.timers.length,0,'retired flight must not schedule another callback');
  assert.equal(await f.engine.refreshUnread({force:true}),2);
  assert.deepEqual(f.sets,[{account:'A',serial:c2,value:2}]);
  assert.equal(f.count(),2,'only one legitimate query per client action');
}
async function oldAccountResponse(){
  const f=fixture();
  const c1=await f.login('A','SA');
  const g=f.gateClient(c1);
  const old=f.engine.refreshUnread({force:true});
  await g.started;
  await f.login('B','SB');
  g.release({data:111,error:null});
  await old;
  assert.equal(f.badge(),7);
  assert.equal(f.sets.length,0);
  assert.equal(f.count(),1);
  assert.equal(await f.engine.refreshUnread({force:true}),2);
  assert.equal(f.sets[0].account,'B');
}
async function staleFinallyCannotConsumeNewQueue(){
  const f=fixture();
  const c1=await f.login('A','SA');
  const g1=f.gateClient(c1);
  const old=f.engine.refreshUnread({force:true});
  await g1.started;
  const c2=await f.login('A','SA');
  const g2=f.gateClient(c2);
  const fresh=f.engine.refreshUnread({force:true});
  await g2.started;
  const joined=f.engine.refreshUnread({force:true});
  assert.equal(f.count(),2,'same owner joins one active unread RPC');
  g1.release({data:99,error:null});
  await old;
  assert.equal(f.sets.length,0,'obsolete reply cannot mutate badge');
  assert.equal(f.timers.length,0,'obsolete finally must not schedule newer queued refresh');
  g2.release({data:3,error:null});
  assert.equal(await fresh,3);
  assert.equal(await joined,3);
  assert.equal(f.count(),2);
  assert.deepEqual(f.sets,[{account:'A',serial:c2,value:3}]);
  assert.equal(f.timers.length,1,
    'current single-flight owns exactly one queued cooldown, not the old flight');
}
async function errorRetainsBadge(){
  const f=fixture();
  const c1=await f.login('A','SA');
  const g=f.gateClient(c1);
  const pending=f.engine.refreshUnread({force:true});
  await g.started;
  g.release({data:null,error:{code:'timeout'}});
  assert.equal(await pending,7);
  assert.equal(f.sets.length,0);
}
(async()=>{
  await oldClientSameSession();
  await oldAccountResponse();
  await staleFinallyCannotConsumeNewQueue();
  await errorRetainsBadge();
  console.log('CHAT unread badge client identity, single-flight and stale-finalizer regression PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
