'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
function deferred(){
  let resolve;
  const promise=new Promise(r=>{resolve=r;});
  return {promise,resolve};
}
async function drain(){
  for(let n=0;n<32;n++)await Promise.resolve();
}
function fixture(){
  let auth={state:'GUEST',appSessionId:null,account:null,client:null};
  const listeners=new Map(),writes=[],readWrites=[],ui=[],rpcs=[],badges=[];
  const gates={readAck:null,readCache:null,contactWrite:null};
  let currentContact=null;
  let badge=9;
  const cache={
    async open(){return true;},
    async pruneAdminTestConversationCache(){return false;},
    async listContacts(){return [];},
    async putReadState(account,payload){
      if(gates.readCache?.account===account){
        gates.readCache.started.resolve();
        await gates.readCache.promise;
      }
      readWrites.push({account,conversation:payload.conversation_id,reader:payload.account_id});
      return true;
    },
    async upsertContact(account,row){
      if(gates.contactWrite?.account===account){
        gates.contactWrite.started.resolve();
        await gates.contactWrite.promise;
      }
      writes.push({account,unread:row.has_unread,conversation:row.conversation_id});
      return true;
    },
    async isInitialized(){return true;},
    async getCursor(){return 0;},async setCursor(){return true;},
    async listOutbox(){return [];}
  };
  const document={
    addEventListener(type,fn){const entries=listeners.get(type)||[];entries.push(fn);listeners.set(type,entries);},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);return true;}
  };
  const ctx={
    console,window:null,document,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Blob,Promise,
    navigator:{onLine:true},
    queueMicrotask(){},setTimeout(){return 1;},clearTimeout(){},
    V21AuthSessionStore:{
      snapshot(){return{state:auth.state,appSessionId:auth.appSessionId,account:auth.account};},
      getClient(){return auth.client;}
    },
    V21CacheStore:cache,
    V21MessageStore:{reset(){},setContext(){},replace(){},stashCurrentView(){},restoreSession(){return null;}},
    V21ContactStore:{
      snapshot(){return currentContact?[currentContact]:[];},
      upsert(row){ui.push({account:auth.account?.id,row:{...row}});currentContact={...row};},
      replace(){},clear(){currentContact=null;}
    },
    ChatAppShell:{
      snapshot(){return {route:'chat',sidebarOpen:true,activeContact:null};},
      UnreadIndicator:{
        snapshot(){return badge;},
        set(value){badge=value;badges.push({account:auth.account?.id,value});}
      }
    },
    CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}}
  };
  ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(source,ctx);
  function clientFor(account,session){
    return {
      async rpc(name,args){
        rpcs.push({account,session,name,args});
        if(name==='v21_mark_read'){
          if(gates.readAck?.account===account&&gates.readAck?.session===session){
            gates.readAck.started.resolve();
            return gates.readAck.promise;
          }
          return{data:true,error:null};
        }
        if(name==='v21_unread_count')return{data:2,error:null};
        if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
        return{data:[],error:null};
      }
    };
  }
  async function login(account,session){
    auth={
      state:'AUTHENTICATED',appSessionId:session,
      account:{id:account},client:clientFor(account,session)
    };
    currentContact={id:'contact-'+account,conversation_id:'SAME-CONV',has_unread:true,latest_at:'2026-10-29T00:00:00Z'};
    document.dispatchEvent({type:'v21-auth-state',detail:{state:'AUTHENTICATED'}});
    await drain();
    assert.equal(ctx.V21SyncEngine.snapshot().accountId,account);
  }
  const counts=name=>rpcs.filter(x=>x.name===name).length;
  return{engine:ctx.V21SyncEngine,login,gates,writes,readWrites,ui,rpcs,badges,counts,
    contact:()=>currentContact,badge:()=>badge};
}
function gate(account,session=null){
  const started=deferred(),blocked=deferred();
  return{account,session,started,promise:blocked.promise,release:blocked.resolve};
}
async function staleAckDifferentAccount(){
  const f=fixture();
  await f.login('A','SA');
  const g=f.gates.readAck=gate('A','SA');
  const pending=f.engine.markRead('SAME-CONV');
  await g.started.promise;
  await f.login('B','SB');
  g.release({data:true,error:null});
  assert.equal(await pending,false,'A acknowledgment must not commit in B session');
  assert.equal(f.contact().has_unread,true);
  assert.equal(f.writes.length,0);
  assert.equal(f.ui.length,0);
  assert.equal(f.counts('v21_unread_count'),0,'old read ACK must not count B unread');
  assert.equal(f.rpcs.filter(x=>x.name==='v21_mark_read').length,1,'never retry old command');
  const good=await f.engine.markRead('SAME-CONV');
  assert.equal(good,true);
  assert.equal(f.contact().has_unread,false,'current B read still updates local sidebar');
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].account,'B');
  assert.equal(f.counts('v21_unread_count'),1);
  assert.deepEqual(f.badges,[{account:'B',value:2}]);
}
async function staleAckSameAccountNewSession(){
  const f=fixture();
  await f.login('A','OLD');
  const g=f.gates.readAck=gate('A','OLD');
  const pending=f.engine.markRead('SAME-CONV');
  await g.started.promise;
  await f.login('A','NEW');
  g.release({data:true,error:null});
  assert.equal(await pending,false);
  assert.equal(f.writes.length,0);
  assert.equal(f.counts('v21_unread_count'),0);
  assert.equal((await f.engine.markRead('SAME-CONV')),true);
  assert.equal(f.writes.length,1);
}
async function staleContactWrite(){
  const f=fixture();
  await f.login('A','SA');
  const g=f.gates.contactWrite=gate('A');
  const pending=f.engine.markRead('SAME-CONV');
  await g.started.promise;
  await f.login('B','SB');
  g.release();
  assert.equal(await pending,false);
  assert.deepEqual(f.writes.map(x=>x.account),['A'],
    'already-started account A write must stay A-keyed');
  assert.equal(f.ui.length,0,'late local cache completion must not repaint B');
  assert.equal(f.counts('v21_unread_count'),0);
}
async function staleCrossDeviceReadEvent(){
  const f=fixture();
  await f.login('A','SA');
  const g=f.gates.readCache=gate('A');
  const promise=f.engine.consumeRealtimeEvent({
    entity_type:'read_state',
    target_account_id:'A',
    payload:{conversation_id:'SAME-CONV',account_id:'A',version:1}
  });
  await g.started.promise;
  await f.login('B','SB');
  g.release();
  await promise;
  assert.deepEqual(f.readWrites,[{account:'A',conversation:'SAME-CONV',reader:'A'}]);
  assert.equal(f.contact().has_unread,true);
  assert.equal(f.writes.length,0);
  assert.equal(f.counts('v21_unread_count'),0);
  assert.equal(f.ui.length,0);
}
async function genuineCrossDeviceReadEvent(){
  const f=fixture();
  await f.login('B','SB');
  await f.engine.consumeRealtimeEvent({
    entity_type:'read_state',target_account_id:'B',
    payload:{conversation_id:'SAME-CONV',account_id:'B',version:2}
  });
  await drain();
  assert.equal(f.contact().has_unread,false);
  assert.deepEqual(f.writes.map(x=>x.account),['B']);
  assert.equal(f.readWrites[0].account,'B');
  assert.equal(f.counts('v21_mark_read'),0,
    'server-origin read event must not trigger another markRead command');
  assert.equal(f.counts('v21_unread_count'),1);
}
(async()=>{
  await staleAckDifferentAccount();
  await staleAckSameAccountNewSession();
  await staleContactWrite();
  await staleCrossDeviceReadEvent();
  await genuineCrossDeviceReadEvent();
  console.log('CHAT read/unread ACK auth fence, delayed cache, multi-device receipt PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
