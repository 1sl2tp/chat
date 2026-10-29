'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','v21-media-cache.js'),'utf8');
function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
function fixture(){
  const rows=new Map();
  const events=[];
  const downloads=[];
  const context={
    console,Blob,Map,Set,Date,Number,String,Boolean,Math,
    setTimeout:()=>1,clearTimeout:()=>{},
    navigator:{storage:{estimate:async()=>({usage:0,quota:0})}},
    document:{dispatchEvent(event){events.push(event);return true;}},
    CustomEvent:class CustomEvent{
      constructor(type,{detail}={}){this.type=type;this.detail=detail;}
    }
  };
  context.window=context;
  context.V21CacheStore={
    async getMediaRecord(accountId,assetId){
      return rows.get(accountId+'::'+assetId)||null;
    },
    async putMediaRecord(accountId,assetId,patch){
      const key=accountId+'::'+assetId;
      rows.set(key,{...rows.get(key),...patch,account_id:accountId,asset_id:assetId});
      return true;
    },
    async removeMediaRecord(accountId,assetId){
      return rows.delete(accountId+'::'+assetId);
    },
    async listMediaRecords(){return[];}
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  const client={storage:{from(bucket){
    assert.equal(bucket,'v21-media');
    return{download(storageKey){
      const gate=deferred();
      downloads.push({storageKey,gate});
      return gate.promise;
    }};
  }}};
  return{api:context.V21MediaCache,rows,events,downloads,client};
}
function seed(h,id){
  h.rows.set('A::'+id,{
    account_id:'A',asset_id:id,blob:null,local:false,
    remote_meta:{id,conversation_id:'C',kind:'image',storage_key:'A/C/'+id}
  });
}
async function waitForDownload(h,count){
  for(let i=0;i<25&&h.downloads.length<count;i++)await Promise.resolve();
  assert.equal(h.downloads.length,count,'download must start before deletion');
}
async function main(){
  const h=fixture();
  seed(h,'delete');
  const dying=h.api.ensureRemote({accountId:'A',assetId:'delete',client:h.client});
  await waitForDownload(h,1);
  const tombstone='2026-10-29T02:00:00.000Z';
  await h.api.markDeleted({accountId:'A',assetId:'delete',meta:{deleted_at:tombstone}});
  h.downloads[0].gate.resolve({data:new Blob(['old picture'],{type:'image/png'}),error:null});
  const finalDeleted=await dying;
  assert.equal(finalDeleted.remote_meta.deleted_at,tombstone);
  assert.equal(h.rows.get('A::delete').blob,null);
  assert.equal(h.rows.get('A::delete').remote_meta.deleted_at,tombstone);
  assert.equal(h.events.filter(e=>e.type==='v21-media-ready').length,0,
    'late deleted asset must never emit media-ready');

  seed(h,'removed');
  const removed=h.api.ensureRemote({accountId:'A',assetId:'removed',client:h.client});
  await waitForDownload(h,2);
  await h.api.remove({accountId:'A',assetId:'removed'});
  h.downloads[1].gate.resolve({data:new Blob(['old file']),error:null});
  assert.equal(await removed,null);
  assert.equal(h.rows.has('A::removed'),false,'late download cannot revive removed record');
  assert.equal(h.events.filter(e=>e.type==='v21-media-ready').length,0);

  seed(h,'valid');
  const first=h.api.ensureRemote({accountId:'A',assetId:'valid',client:h.client});
  const second=h.api.ensureRemote({accountId:'A',assetId:'valid',client:h.client});
  await waitForDownload(h,3);
  assert.equal(h.downloads.length,3,'concurrent calls for one asset share a download');
  h.downloads[2].gate.resolve({data:new Blob(['valid picture'],{type:'image/png'}),error:null});
  const [a,b]=await Promise.all([first,second]);
  assert.equal(a.blob.size,13);
  assert.equal(b.blob.size,13);
  assert.equal(h.events.filter(e=>e.type==='v21-media-ready').length,1,
    'valid single-flight hydration emits exactly one ready event');
  assert.equal(h.rows.get('A::delete').blob,null,'other asset remains deleted');
  assert.equal(h.downloads.length,3,'no extra provider attempt');
  console.log('CHAT in-flight media delete/remove cancellation + valid single-flight PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
