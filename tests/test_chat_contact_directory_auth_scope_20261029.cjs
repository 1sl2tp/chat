'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
async function settle(){
  for(let i=0;i<32;i++)await Promise.resolve();
}
function fixture(){
  let auth={state:'GUEST',appSessionId:null,account:null,client:null};
  const listeners=new Map(),ui=[],disk=[],conversationWrites=[],listed=[],calls=[],queued=[];
  const gates={sidebar:null,replace:null,list:null,prune:null};
  const online={onLine:true};
  const cached={A:[],B:[]};
  const cache={
    async pruneAdminTestConversationCache(account){
      if(gates.prune?.account===account){
        gates.prune.started.resolve();
        await gates.prune.promise;
      }
      return false;
    },
    async open(){return true;},
    async listContacts(account){
      listed.push(account);
      if(gates.list?.account===account){
        gates.list.started.resolve();
        return gates.list.promise;
      }
      return cached[account]||[];
    },
    async replaceContacts(account,rows){
      if(gates.replace?.account===account){
        gates.replace.started.resolve();
        await gates.replace.promise;
      }
      disk.push({account,ids:Array.from(rows,row=>row.id)});
      return true;
    },
    async setConversationId(account,contact,conversation){
      conversationWrites.push({account,contact,conversation});
      return true;
    },
    async isInitialized(){return true;},
    async getCursor(){return 0;},
    async setCursor(){return true;},
    async listOutbox(){return [];},
    async putReadState(){return true;}
  };
  const document={
    addEventListener(type,fn){
      const list=listeners.get(type)||[];
      list.push(fn);listeners.set(type,list);
    },
    dispatchEvent(event){
      for(const fn of listeners.get(event.type)||[])fn(event);
      return true;
    }
  };
  const ctx={
    console,window:null,Map,Set,Array,Object,String,Number,Boolean,Date,JSON,Math,Blob,
    document,CustomEvent:class CustomEvent{
      constructor(type,{detail}={}){this.type=type;this.detail=detail;}
    },
    navigator:online,queueMicrotask(fn){queued.push(fn);},
    setTimeout(){return 1;},clearTimeout(){},
    V21AuthSessionStore:{
      snapshot(){return {state:auth.state,appSessionId:auth.appSessionId,account:auth.account};},
      getClient(){return auth.client;}
    },
    V21CacheStore:cache,
    V21ContactStore:{
      replace(rows){ui.push({account:auth.account?.id||'GUEST',ids:Array.from(rows,row=>row.id)});},
      snapshot(){return [];},clear(){}
    },
    V21MessageStore:{reset(){},setContext(){},replace(){},stashCurrentView(){},restoreSession(){return null;}},
    ChatAppShell:{
      snapshot(){return{route:'chat',sidebarOpen:true,activeContact:null};},
      UnreadIndicator:{snapshot(){return 0;},set(){}}
    }
  };
  ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const engine=ctx.V21SyncEngine;
  function accountClient(account,session){
    return {
      async rpc(name,args){
        calls.push({account,session,name,args});
        if(name==='v21_contacts_sidebar'&&gates.sidebar?.account===account&&gates.sidebar?.session===session){
          gates.sidebar.started.resolve();
          return gates.sidebar.promise;
        }
        if(name==='v21_contacts_sidebar'){
          return{data:[{id:account+'-CURRENT',conversation_id:account+'-CONV',version:1}],error:null};
        }
        if(name==='v21_sync_pull')return{data:{events:[],next_cursor:0,has_more:false},error:null};
        if(name==='v21_unread_count')return{data:0,error:null};
        return{data:null,error:null};
      }
    };
  }
  async function login(account,session){
    auth={state:'AUTHENTICATED',account:{id:account},appSessionId:session,client:accountClient(account,session)};
    document.dispatchEvent({type:'v21-auth-state',detail:{state:'AUTHENTICATED'}});
    await settle();
    assert.equal(engine.snapshot().accountId,account);
    assert.equal(engine.snapshot().appSessionId,session);
  }
  return{engine,login,gates,online,cached,ui,disk,conversationWrites,listed,calls,queued};
}
function hold(account,session){
  const started=deferred(),finish=deferred();
  return{account,session,started,promise:finish.promise,release:finish.resolve};
}
async function staleRpcResult(){
  const h=fixture();
  await h.login('A','SA');
  const gate=h.gates.sidebar=hold('A','SA');
  const request=h.engine.syncContacts();
  await gate.started.promise;
  await h.login('B','SB');
  gate.release({data:[{id:'A-STALE',conversation_id:'A-OLD',version:1}],error:null});
  assert.equal((await request).length,0);
  assert.deepEqual(h.disk,[],'obsolete A response cannot write new-account cache');
  assert.equal(h.ui.some(row=>row.ids.includes('A-STALE')),false);
  assert.equal(h.conversationWrites.length,0);
  const valid=await h.engine.syncContacts();
  assert.equal(valid[0]?.id,'B-CURRENT','new account can still hydrate normally');
  assert.deepEqual(h.disk,[{account:'B',ids:['B-CURRENT']}]);
  assert.equal(h.ui.at(-1).ids[0],'B-CURRENT');
  assert.equal(h.calls.filter(c=>c.name==='v21_contacts_sidebar'&&c.account==='A').length,1,
    'stale result should not launch another provider fetch');
}
async function staleDiskWrite(){
  const h=fixture();
  await h.login('A','SA');
  const gate=h.gates.replace=hold('A');
  const request=h.engine.syncContacts();
  await gate.started.promise;
  await h.login('B','SB');
  gate.release();
  assert.equal((await request).length,0);
  assert.deepEqual(h.disk,[{account:'A',ids:['A-CURRENT']}],
    'already-started write must remain account A scoped');
  assert.equal(h.ui.some(row=>row.ids.includes('A-CURRENT')),false,
    'delayed disk completion must not publish stale contacts');
  assert.equal(h.conversationWrites.some(row=>row.account==='A'),false,
    'follow-up conversation writes stop after account handoff');
}
async function staleOfflineRead(){
  const h=fixture();
  h.online.onLine=false;
  await h.login('A','SA');
  const gate=h.gates.list=hold('A');
  const request=h.engine.syncContacts();
  await gate.started.promise;
  await h.login('B','SB');
  gate.release([{id:'A-OFFLINE'}]);
  assert.equal((await request).length,0);
  assert.equal(h.ui.some(row=>row.ids.includes('A-OFFLINE')),false);
  h.cached.B=[{id:'B-OFFLINE'}];
  const valid=await h.engine.syncContacts();
  assert.equal(valid[0].id,'B-OFFLINE');
  assert.equal(h.ui.at(-1).ids[0],'B-OFFLINE',
    'current account can still show offline local contacts');
}
async function sameAccountNewSession(){
  const h=fixture();
  await h.login('A','OLDSESSION');
  const gate=h.gates.sidebar=hold('A','OLDSESSION');
  const request=h.engine.syncContacts();
  await gate.started.promise;
  await h.login('A','NEWSESSION');
  gate.release({data:[{id:'A-OLDSESSION'}],error:null});
  assert.equal((await request).length,0);
  assert.equal(h.disk.length,0);
  assert.equal(h.ui.some(row=>row.ids.includes('A-OLDSESSION')),false);
  const valid=await h.engine.syncContacts();
  assert.equal(valid[0].id,'A-CURRENT');
}
async function staleBootstrap(){
  const h=fixture();
  const gate=h.gates.prune=hold('A');
  await h.login('A','SA');
  await gate.started.promise;
  await h.login('B','SB');
  gate.release();
  await settle();
  assert.equal(h.listed.includes('A'),false,
    'old bootstrap cannot resume hydration after account switch');
  assert.equal(h.ui.some(row=>row.ids.some(id=>id.startsWith('A-'))),false);
}
(async()=>{
  await staleRpcResult();
  await staleDiskWrite();
  await staleOfflineRead();
  await sameAccountNewSession();
  await staleBootstrap();
  console.log('CHAT directory auth scope fencing online/offline/bootstrap PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
