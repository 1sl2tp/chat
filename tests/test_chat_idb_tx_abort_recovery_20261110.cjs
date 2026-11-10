'use strict';
// IDB-272: iOS Safari can complete a transaction before an await resumes.
// Never lose a contact replacement or turn an optional local read into a red
// global runtime banner. Canonical message/outbox data are not deleted.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'v21-cache-store.js'),'utf8');
const syncSource=fs.readFileSync(path.join(root,'v21-sync-engine.js'),'utf8');

function cacheFixture(){
  const writes=[],transactions=[];
  const db={
    transaction(storeName,mode){
      let active=true;
      const tx={
        error:null,oncomplete:null,onabort:null,onerror:null,
        abort(){active=false;this.error=new Error('forced_abort');this.onabort?.();},
        objectStore(){
          return{
            put(row){assert(active,'put cannot run after Safari transaction auto-commit');writes.push({storeName,row});},
            get(){
              const request={};
              queueMicrotask(()=>{
                request.result={value:'retained'};
                request.onsuccess?.();
                active=false;
                tx.oncomplete?.();
              });
              return request;
            },
            index(){
              return{
                openCursor(){
                  const request={};
                  queueMicrotask(()=>{
                    request.result=null;
                    request.onsuccess?.();
                    active=false;
                    tx.oncomplete?.();
                  });
                  return request;
                },
                getAll(){
                  const request={};
                  queueMicrotask(()=>{
                    request.result=[];
                    request.onsuccess?.();
                    active=false;
                    tx.oncomplete?.();
                  });
                  return request;
                }
              };
            }
          };
        }
      };
      transactions.push({storeName,mode,tx});
      return tx;
    }
  };
  const indexedDB={open(){
    const request={};
    queueMicrotask(()=>{request.result=db;request.onsuccess?.();});
    return request;
  }};
  const ctx={indexedDB,IDBKeyRange:{only:x=>x,bound:(a,b)=>[a,b]},
    window:null,console,Promise,Date,Blob,Set,Map,Number,String,Array,Object};
  ctx.window=ctx;
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  return{cache:ctx.V21CacheStore,writes,transactions};
}
async function deadline(promise){
  return Promise.race([
    promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('transaction_complete_handler_missed')),400))
  ]);
}
async function testTransaction(){
  const f=cacheFixture();
  const meta=await deadline(f.cache.getMeta('admin','cursor',null));
  assert.equal(meta,'retained','a completed readonly transaction must not hang its caller');
  await deadline(f.cache.replaceContacts('admin',[{id:'customer',display_name:'KH'}]));
  assert(f.writes.some(x=>x.storeName==='contacts'&&x.row.cache_key==='admin:contact:customer'),
    'replacement put occurs inside the active cursor success callback');
  assert.equal(f.transactions.filter(x=>x.storeName==='contacts').length,1,
    'one atomic contacts transaction; no extra writes/retries');
}
async function testServerFirstOnAbortedLocalCache(){
  const listeners=new Map();
  let directory=[], auth={state:'GUEST',account:null,appSessionId:null};
  const calls=[];
  const client={rpc(name){
    calls.push(name);
    if(name==='v21_contacts_sidebar')return Promise.resolve({data:[{
      id:'customer',display_name:'Fresh customer',conversation_id:'conv-1',version:1
    }],error:null});
    if(name==='v21_sync_pull')return Promise.resolve({data:{
      events:[],next_cursor:0,has_more:false
    },error:null});
    if(name==='v21_unread_count')return Promise.resolve({data:0,error:null});
    return Promise.resolve({data:[],error:null});
  }};
  const doc={
    addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);return true;}
  };
  const ctx={console,document:doc,navigator:{onLine:true},queueMicrotask,
    setTimeout,clearTimeout,Promise,Map,Set,Array,Object,String,Number,Date,Math,JSON,Blob,
    CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
    V21CacheStore:{
      async open(){throw new Error('idb_tx_aborted');},
      async pruneAdminTestConversationCache(){return false;},
      async isInitialized(){return true;},
      async getCursor(){return 0;},
      async listOutbox(){return[];}
    },
    V21AuthSessionStore:{
      snapshot(){return auth;},
      getClient(){return client;}
    },
    V21ContactStore:{replace(rows){directory=Array.from(rows);},snapshot(){return directory;},clear(){directory=[];}},
    V21MessageStore:{reset(){},replace(){},snapshot(){return{};},setContext(){},restoreSession(){return null;}},
    ChatAppShell:{snapshot(){return{route:'chat',sidebarOpen:true,activeContact:null};},
      UnreadIndicator:{set(){},snapshot(){return 0;}}}
  };
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(syncSource,ctx);
  auth={state:'AUTHENTICATED',account:{id:'admin'},appSessionId:'session-admin'};
  doc.dispatchEvent(new ctx.CustomEvent('v21-auth-state',{detail:{state:'AUTHENTICATED'}}));
  for(let i=0;i<160;i++)await Promise.resolve();
  assert(calls.includes('v21_contacts_sidebar'),'canonical contacts RPC must still run');
  assert.equal(directory[0]?.display_name,'Fresh customer','the UI keeps server contacts');
  assert.equal(ctx.V21SyncEngine.snapshot().accountId,'admin','auth session is retained');
}
(async()=>{
  await testTransaction();
  await testServerFirstOnAbortedLocalCache();
  console.log('IDB-272 Safari transaction lifetime + local abort server-first recovery PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
