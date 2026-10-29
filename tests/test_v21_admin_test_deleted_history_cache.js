'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','v21-cache-store.js'),'utf8');
const sync=fs.readFileSync(path.join(__dirname,'..','v21-sync-engine.js'),'utf8');
const start=source.indexOf('// One-time targeted reset for the two admin');
const end=source.indexOf('window.V21CacheStore={',start);
assert(start>=0&&end>start,'one-time browser cache migration must be present');
const admin='b88e5d98-0032-46fc-9741-01722c99252d';
const test='8c4ac6ec-3178-4661-8696-04e345bf443e';
const old='1c2bc6f5-b2c7-4eca-a5ce-61c11306e1ab';
const other='unrelated-conversation';
const dbRows={
 messages:[
  {account_id:admin,conversation_id:old,id:'deleted-message'},
  {account_id:admin,conversation_id:other,id:'keep-message'},
  {account_id:test,conversation_id:old,id:'test-message'}
 ],
 media:[
  {account_id:admin,remote_meta:{conversation_id:old},asset_id:'deleted-media',blob:{bytes:123}},
  {account_id:admin,remote_meta:{conversation_id:other},asset_id:'keep-media'},
  {account_id:test,remote_meta:{conversation_id:old},asset_id:'test-media'}
 ],
 read_states:[
  {owner_account_id:admin,conversation_id:old},
  {owner_account_id:admin,conversation_id:other}
 ],
 contacts:[
  {account_id:admin,id:test,conversation_id:old},
  {account_id:admin,id:'unrelated-customer',conversation_id:other}
 ],
 outbox:[
  {account_id:admin,contact_id:test,conversation_id:old,created_at:'2026-10-18'},
  {account_id:admin,contact_id:'unrelated-customer',conversation_id:other,created_at:'2026-10-18'}
 ],
 meta:[
  {account_id:admin,name:'conversation:'+test},
  {account_id:admin,name:'conversation_hydrated:'+old},
  {account_id:admin,name:'sync_cursor'},
  {account_id:admin,name:'conversation:unrelated-customer'}
 ]
};
let fullTestClear=0;
const metaState={};
const fakeDb={
 transaction(storeName){
  const rows=dbRows[storeName];
  return {
   objectStore(){
    return{
     index(indexName){
      assert(['by_account','by_account_created'].includes(indexName));
      return{
       openCursor(range){
        if(indexName==='by_account_created')assert.deepEqual(Array.from(range.lower),[admin,'']);
        const owner=indexName==='by_account_created'?range.lower[0]:range.only;
        const selected=rows.filter(r=>String(r.account_id||r.owner_account_id)===owner);
        let at=0;
        const cursorReq={result:null,onerror:null,onsuccess:null,error:null};
        const fire=()=>{
         queueMicrotask(()=>{
          const value=selected[at];
          cursorReq.result=value
           ? {value,delete(){const ix=rows.indexOf(value);if(ix>=0)rows.splice(ix,1);},
               continue(){at++;fire();}}
           :null;
          cursorReq.onsuccess?.();
         });
        };
        fire();
        return cursorReq;
       }
      };
     }
    };
   }
  };
 }
};
const ctx={
 open:async()=>fakeDb, txDone:async()=>true,
 IDBKeyRange:{only:x=>({only:x}),bound:(lower,upper)=>({lower,upper})},
 getMeta:async(account,key,defaultValue)=>metaState[account+':'+key]??defaultValue,
 setMeta:async(account,key,value)=>{metaState[account+':'+key]=value;return value;},
 clearAccount:async account=>{assert.equal(account,test);fullTestClear++;return true;},
 String,Set,Promise,Error,Array,Math,Number,console,queueMicrotask
};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end),ctx);
(async()=>{
 assert.equal(await vm.runInContext('pruneAdminTestConversationCache',ctx)('outside-account'),false);
 assert.equal(await vm.runInContext('pruneAdminTestConversationCache',ctx)(admin),true);
 assert.deepEqual(dbRows.messages.filter(r=>r.account_id===admin).map(r=>r.id),['keep-message']);
 assert.deepEqual(dbRows.media.filter(r=>r.account_id===admin).map(r=>r.asset_id),['keep-media']);
 assert.deepEqual(dbRows.contacts.map(r=>r.id),['unrelated-customer']);
 assert.equal(dbRows.outbox.length,1);assert.equal(dbRows.outbox[0].contact_id,'unrelated-customer');
 assert.deepEqual(dbRows.meta.map(r=>r.name),['sync_cursor','conversation:unrelated-customer']);
 assert.equal(await vm.runInContext('pruneAdminTestConversationCache',ctx)(admin),false,'rerun should be idempotent');
 assert.equal(await vm.runInContext('pruneAdminTestConversationCache',ctx)(test),true);
 assert.equal(fullTestClear,1);
 const authStart=sync.indexOf('async function onAuth(');
 const authEnd=sync.indexOf('async function clearAccount(',authStart);
 const authBody=sync.slice(authStart,authEnd);
 const owner=authBody.indexOf('const context=captureSyncOwnerContext();');
 const purge=authBody.indexOf('pruneAdminTestConversationCache?.(context.accountId)');
 const fence=authBody.indexOf('if(!syncOwnerContextCurrent(context))return;',purge);
 const hydration=authBody.indexOf('await hydrateAccount(context)');
 assert(owner>=0&&purge>owner&&fence>purge&&hydration>fence,
  'purge must run under the initiating owner and finish before cache hydration');
 console.log('Admin/test scoped deleted-chat cache purge: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
