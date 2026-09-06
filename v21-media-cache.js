(()=>{
'use strict';
const VERSION='V21.71';
const DEFAULT_SOFT_LIMIT=128*1024*1024;
const MEDIA_BUCKET='v21-media';
const inflight=new Map();
let evictionTimer=0;
let evictionAccountId=null;

function cache(){return window.V21CacheStore||null;}
function key(accountId,assetId){return `${String(accountId)}::${String(assetId)}`;}


function scheduleEviction(accountId){
  const id=String(accountId||'');
  if(!id)return;
  evictionAccountId=id;
  if(evictionTimer)return;
  evictionTimer=setTimeout(()=>{
    evictionTimer=0;
    const target=evictionAccountId;
    evictionAccountId=null;
    if(target)void evictIfNeeded({accountId:target}).catch(()=>{});
  },1500);
}

async function putLocal({accountId,assetId,blob,meta={}}){
  if(!accountId||!assetId||!(blob instanceof Blob))throw new Error('invalid_media_cache_input');
  await cache()?.putMediaRecord?.(accountId,assetId,{
    blob,
    local:true,
    pinned:true,
    remote_meta:{...(meta||{})},
    size_bytes:Number(blob.size)||Number(meta.size_bytes)||0,
    mime_type:blob.type||meta.mime_type||'application/octet-stream',
    last_accessed_at:Date.now()
  });
  scheduleEviction(accountId);
  return{assetId:String(assetId),local:true};
}

async function putRemoteMeta({accountId,assetId,meta={}}){
  if(!accountId||!assetId)return false;
  await cache()?.putMediaRecord?.(accountId,assetId,{
    remote_meta:{...(meta||{})},
    pinned:false,
    last_accessed_at:Date.now()
  });
  // A sender Blob starts pinned while it is only a draft/outbox asset. ACK
  // turns it into normal cache data, so run the same quota policy now that it
  // is actually eligible for eviction.
  scheduleEviction(accountId);
  return true;
}

async function get({accountId,assetId}){
  if(!accountId||!assetId)return null;
  return cache()?.getMediaRecord?.(accountId,assetId)||null;
}

async function remove({accountId,assetId}){
  if(!accountId||!assetId)return false;
  return cache()?.removeMediaRecord?.(accountId,assetId)||false;
}

async function markDeleted({accountId,assetId,meta={}}={}){
  if(!accountId||!assetId)return false;
  const existing=await get({accountId,assetId});
  const remoteMeta={
    ...((existing&&existing.remote_meta)||{}),
    ...(meta||{}),
    id:String(assetId),
    deleted_at:meta?.deleted_at||new Date().toISOString()
  };
  await cache()?.putMediaRecord?.(accountId,assetId,{
    blob:null,
    local:false,
    pinned:false,
    remote_meta:remoteMeta,
    size_bytes:Number(remoteMeta.size_bytes)||Number(existing?.size_bytes)||0,
    mime_type:remoteMeta.mime_type||existing?.mime_type||'application/octet-stream',
    last_accessed_at:Date.now()
  });
  document.dispatchEvent(new CustomEvent('v21-media-removed',{
    detail:{accountId:String(accountId),assetId:String(assetId)}
  }));
  return true;
}

async function findByContentHash({accountId,conversationId,contentHash,excludeAssetId=''}={}){
  const hash=String(contentHash||'').toLowerCase();
  if(!accountId||!conversationId||!hash)return null;
  const rows=await cache()?.listMediaRecords?.(accountId)||[];
  for(const row of rows){
    const meta=row?.remote_meta||{};
    if(String(row?.asset_id||'')===String(excludeAssetId||''))continue;
    if(meta.deleted_at)continue;
    if(String(meta.conversation_id||'')!==String(conversationId))continue;
    if(String(meta.kind||'image')!=='image')continue;
    if(String(meta.content_hash||'').toLowerCase()===hash)return row;
  }
  return null;
}

async function hasBlob({accountId,assetId}){
  const row=await get({accountId,assetId});
  return Boolean(row?.blob instanceof Blob);
}

async function indexByMessage({accountId}={}){
  const grouped=new Map();
  if(!accountId)return grouped;
  const rows=await cache()?.listMediaRecords?.(accountId)||[];
  for(const row of rows){
    const meta=row?.remote_meta||null;
    const messageId=String(meta?.message_id||'');
    if(!meta||!messageId||meta.deleted_at)continue;
    const list=grouped.get(messageId)||[];
    list.push(meta);
    grouped.set(messageId,list);
  }
  for(const list of grouped.values()){
    list.sort((a,b)=>
      Number(a.sort_index||0)-Number(b.sort_index||0)||
      String(a.created_at||'').localeCompare(String(b.created_at||''))||
      String(a.id||'').localeCompare(String(b.id||''))
    );
  }
  return grouped;
}

async function listForMessage({accountId,messageId}){
  if(!accountId||!messageId)return[];
  const grouped=await indexByMessage({accountId});
  return grouped.get(String(messageId))||[];
}

async function ensureRemote({accountId,assetId,client}={}){
  if(!accountId||!assetId||!client)return null;
  const cacheKey=key(accountId,assetId);
  if(inflight.has(cacheKey))return inflight.get(cacheKey);

  const promise=(async()=>{
    const existing=await get({accountId,assetId});
    if(existing?.blob instanceof Blob)return existing;
    const meta=existing?.remote_meta||null;
    const storageKey=String(meta?.storage_key||'');
    if(!storageKey||meta?.deleted_at)return existing||null;

    const {data,error}=await client.storage.from(MEDIA_BUCKET).download(storageKey);
    if(error||!(data instanceof Blob))return existing||null;

    await cache()?.putMediaRecord?.(accountId,assetId,{
      blob:data,
      local:false,
      pinned:false,
      remote_meta:{...(meta||{})},
      size_bytes:Number(data.size)||Number(meta?.size_bytes)||0,
      mime_type:data.type||meta?.mime_type||'application/octet-stream',
      last_accessed_at:Date.now()
    });
    const row=await get({accountId,assetId});
    scheduleEviction(accountId);
    document.dispatchEvent(new CustomEvent('v21-media-ready',{
      detail:{accountId:String(accountId),assetId:String(assetId)}
    }));
    return row;
  })().finally(()=>inflight.delete(cacheKey));

  inflight.set(cacheKey,promise);
  return promise;
}

async function estimate(){
  try{return await navigator.storage?.estimate?.()||{usage:0,quota:0};}catch{return{usage:0,quota:0};}
}

async function evictIfNeeded({accountId,softLimitBytes=DEFAULT_SOFT_LIMIT}={}){
  const stats=await estimate();
  const usage=Number(stats?.usage)||0;
  const quota=Number(stats?.quota)||0;
  const rows=accountId?await cache()?.listMediaRecords?.(accountId)||[]:[];
  let blobBytes=rows.reduce((sum,row)=>sum+(row?.blob instanceof Blob?(Number(row.blob.size)||0):0),0);
  const target=Math.max(16*1024*1024,Math.min(Number(softLimitBytes)||DEFAULT_SOFT_LIMIT,quota>0?Math.floor(quota*0.65):DEFAULT_SOFT_LIMIT));
  let evicted=0;
  let approxUsage=usage;
  if(blobBytes>target||(quota>0&&approxUsage/quota>0.8)){
    const candidates=rows.filter(row=>row?.blob instanceof Blob&&!row?.pinned).sort((a,b)=>(Number(a.last_accessed_at)||0)-(Number(b.last_accessed_at)||0));
    for(const row of candidates){
      if(blobBytes<=target&&(quota<=0||approxUsage/quota<=0.8))break;
      const size=Number(row.blob.size)||0;
      await cache()?.putMediaRecord?.(accountId,row.asset_id,{blob:null,local:false,last_accessed_at:Date.now()});
      blobBytes=Math.max(0,blobBytes-size);
      approxUsage=Math.max(0,approxUsage-size);
      evicted+=1;
    }
  }
  return{usage,approxUsage,quota,softLimitBytes,targetBytes:target,blobBytes,evicted};
}

window.V21MediaCache={
  version:VERSION,putLocal,putRemoteMeta,get,remove,markDeleted,findByContentHash,hasBlob,indexByMessage,listForMessage,ensureRemote,estimate,evictIfNeeded
};
})();
