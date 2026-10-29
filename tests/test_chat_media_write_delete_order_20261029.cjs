'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','v21-media-cache.js'),'utf8');

function deferred(){
  let resolve;
  const promise=new Promise(r=>{resolve=r;});
  return {promise,resolve};
}
function fixture({failPendingWrite=false}={}){
  const rows=new Map(),events=[],downloads=[];
  const writeStarted=deferred(),releaseWrite=deferred();
  const accountId='A',assetId='mid-write';
  rows.set(accountId+'::'+assetId,{
    account_id:accountId,asset_id:assetId,blob:null,
    remote_meta:{id:assetId,kind:'image',conversation_id:'C',storage_key:'A/C/mid-write'}
  });
  const cache={
    async getMediaRecord(a,id){return rows.get(a+'::'+id)||null;},
    async putMediaRecord(a,id,patch){
      if(patch.blob instanceof Blob){
        writeStarted.resolve();
        await releaseWrite.promise;
        if(failPendingWrite)throw Error('synthetic_cache_put_failure');
      }
      const k=a+'::'+id;
      rows.set(k,{...rows.get(k),...patch,account_id:a,asset_id:id});
      return true;
    },
    async removeMediaRecord(a,id){return rows.delete(a+'::'+id);},
    async listMediaRecords(){return[];}
  };
  const context={
    console,Blob,Map,Set,Date,Number,String,Boolean,Math,
    setTimeout:()=>1,clearTimeout:()=>{},
    document:{dispatchEvent(e){events.push(e);return true;}},
    CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
    navigator:{storage:{estimate:async()=>({usage:0,quota:0})}},
    V21CacheStore:cache
  };
  context.window=context;
  vm.createContext(context);vm.runInContext(source,context);
  const client={storage:{from(bucket){
    assert.equal(bucket,'v21-media');
    return{async download(key){
      downloads.push(key);
      return {data:new Blob(['picture'],{type:'image/png'}),error:null};
    }};
  }}};
  return{api:context.V21MediaCache,rows,events,downloads,writeStarted,releaseWrite,accountId,assetId,client};
}
async function drainMicrotasks(){
  for(let i=0;i<16;i++)await Promise.resolve();
}
async function scenario(action,failPendingWrite=false){
  const h=fixture({failPendingWrite});
  const request=h.api.ensureRemote({accountId:h.accountId,assetId:h.assetId,client:h.client});
  await h.writeStarted.promise;
  let deleteFinished=false;
  const deleting=h.api[action]({accountId:h.accountId,assetId:h.assetId,
    ...(action==='markDeleted'?{meta:{deleted_at:'2026-10-29T10:00:00.000Z'}}:{})
  }).then(value=>{deleteFinished=true;return value;});
  await drainMicrotasks();
  assert.equal(deleteFinished,false,action+' must not commit before already-started local cache write settles');
  h.releaseWrite.resolve();
  const result=await deleting;
  await request;
  assert.equal(result,true);
  const row=h.rows.get(h.accountId+'::'+h.assetId);
  if(action==='markDeleted'){
    assert.equal(row?.blob,null,'tombstone must clear a late downloaded Blob');
    assert.equal(row?.remote_meta?.deleted_at,'2026-10-29T10:00:00.000Z');
  }else{
    assert.equal(row,undefined,'removed local cache record must stay removed');
  }
  assert.equal(h.events.filter(x=>x.type==='v21-media-ready').length,0);
  assert.deepEqual(h.downloads,['A/C/mid-write'],'no new provider download or fallback');
}

(async()=>{
  await scenario('markDeleted',false);
  await scenario('remove',false);
  await scenario('markDeleted',true);
  await scenario('remove',true);
  console.log('CHAT local media hydration write/delete ordering and failed-write recovery PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
