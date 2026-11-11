'use strict';
// P1-289: no actual outbound traffic. Test the real owner functions in vm
// against local fakes: persisted Storage ACK + missing Blob, validation gates,
// same durable client_id and explicit sync lifecycle evidence.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('v21-sync-engine.js','utf8');
function code(begin,end){
 const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
 assert(a>=0&&b>a,'owner snippet exists: '+begin);
 return source.slice(a,b);
}
const transport=code('function uploadedMediaMetadataValid(', 'function flushOutbox(){');
const retry=code('async function retryFailedMedia(', 'function unreadSnapshot(){');
const wake=code('async function wake(', '// HIST-219:');
const mime=value=>String(value||'').split(';',1)[0].trim().toLowerCase();
const image={
 kind:'image',asset_id:'asset-1',storage_key:'A/CONV/asset-1',
 mime_type:'image/png',size_bytes:11,sort_index:0,uploaded:true,
 width_px:150,height_px:200,content_hash:'sha'
};
function clone(x){return JSON.parse(JSON.stringify(x));}
async function transportCases(){
 let items=[],mediaReads=0,uploaded=0,metaWrites=0,rpcCalls=[];
 const accountId='A',conversationId='CONV';
 const client={async rpc(name,args){
  rpcCalls.push({name,args});
  return{error:null,data:{
   message:{id:'server-row-1',client_id:'media-client-1',
     conversation_id:conversationId,body:'Bill',created_at:'2026-11-11T08:00:00.000Z'},
   media:[{id:'asset-1',kind:'image',conversation_id:conversationId,
     message_id:'server-row-1',owner_account_id:accountId,
     storage_key:'A/CONV/asset-1',mime_type:'image/png',size_bytes:11}]
  }};
 }};
 const ctx={Blob,Number,String,Math,Date,Array,Boolean,
  baseMimeType:mime,
  captureFlushContext:()=>({accountId,appSessionId:'SA',client}),
  mediaAssetsFromOutbox:item=>item.assets,
  cache:()=>({updateOutbox:async (...args)=>{items.push(args)},
    putMessage:async()=>true,removeMessage:async()=>true}),
  media:()=>({get:async()=>{mediaReads++;return null},
    putRemoteMeta:async()=>{metaWrites++}}),
  imageUploadBody:()=>{throw Error('MUST_NOT_REUPLOAD_IMAGE')},
  fileUploadBody:()=>{throw Error('MUST_NOT_REUPLOAD_FILE')},
  uploadMediaStorageObject:async()=>{uploaded++;throw Error('MUST_NOT_UPLOAD')},
  isStorageAlreadyExistsError:()=>false,
  flushContextCurrent:()=>true,
  flushContextChangedError:()=>Error('context_changed'),
  canonicalMedia:meta=>meta,
  canonicalMessage:row=>row,
  messagePreviewContract:row=>({body:row.body}),
  patchContactSummary:async()=>true,
  currentConversationId:conversationId,
  messages:()=>({apply:()=>true,remove:()=>true})
 };
 vm.createContext(ctx);
 vm.runInContext(transport+
  '\nglobalThis.valid=uploadedMediaMetadataValid;globalThis.flush=flushMediaItem;',ctx);
 assert.equal(ctx.valid(image,'image','A','CONV'),true);
 assert.equal(ctx.valid({...image,uploaded:false},'image','A','CONV'),false);
 assert.equal(ctx.valid({...image,storage_key:'B/CONV/asset-1'},'image','A','CONV'),false);
 assert.equal(ctx.valid({...image,size_bytes:0},'image','A','CONV'),false);
 assert.equal(ctx.valid({...image,size_bytes:15728641},'image','A','CONV'),false);
 assert.equal(ctx.valid({...image,mime_type:'application/pdf'},'image','A','CONV'),false);
 assert.equal(ctx.valid({...image,mime_type:'audio/mpeg',kind:'audio'},'audio','A','CONV'),true);
 assert.equal(ctx.valid({...image,kind:'file',mime_type:'application/pdf',file_name:'x.pdf'},'file','A','CONV'),true);
 assert.equal(ctx.valid({...image,kind:'file',mime_type:'application/pdf',file_name:''},'file','A','CONV'),false);
 let outbox={kind:'media',account_id:accountId,conversation_id:conversationId,
  client_id:'media-client-1',contact_id:'CONTACT',body:'Bill',
  created_at:'2026-11-11T08:00:00.000Z',
  assets:[clone(image)]};
 assert.equal(await ctx.flush(outbox,conversationId),true,
  'a persisted Storage ACK is enough for existing canonical media RPC');
 assert.equal(rpcCalls.length,1);
 assert.equal(rpcCalls[0].name,'v21_media_images_send');
 assert.equal(rpcCalls[0].args.p_client_id,'media-client-1',
  'message idempotency key never changes');
 assert.equal(rpcCalls[0].args.p_assets[0].storage_key,'A/CONV/asset-1');
 assert.equal(uploaded,0,'no new Storage upload');
 assert.equal(mediaReads,0,'persisted Storage ACK must not re-read evicted IndexedDB Blob');
 assert.equal(metaWrites,1);
 const priorRpc=rpcCalls.length;
 const bad={...outbox,assets:[{...image,storage_key:'OTHER/CONV/asset-1'}]};
 await assert.rejects(()=>ctx.flush(bad,conversationId),/uploaded_media_metadata_invalid/);
 assert.equal(rpcCalls.length,priorRpc,'bad key cannot trigger canonical message RPC');
 const unuploaded={...outbox,assets:[{...image,uploaded:false}]};
 await assert.rejects(()=>ctx.flush(unuploaded,conversationId),/image_blob_missing/);
 assert.equal(rpcCalls.length,priorRpc,'missing unuploaded bytes must not be accepted');
}
async function retryCases(){
 let writes=0,wakes=0,localUpdates=0,readBlob=0;
 const client={},accountId='A',appSessionId='SA';
 let row={kind:'media',client_id:'media-client-1',contact_id:'CONTACT',
   conversation_id:'CONV',failed:true,retryable:true,next_retry_at:10000,
   attempts:2,assets:[clone(image)]};
 const owner={accountId,appSessionId,client};
 const ctx={
  Blob,Number,String,Math,Date,
  captureFlushContext:()=>owner,
  syncOwnerContextCurrent:c=>c.accountId===owner.accountId&&c.appSessionId===owner.appSessionId&&c.client===owner.client,
  currentContactId:'CONTACT',currentConversationId:'CONV',
  outboxFlushFlight:null,
  online:()=>true,
  cache:()=>({listOutboxForContact:async()=>[row],
    updateOutbox:async(_account,next)=>{writes++;row=next}}),
  media:()=>({get:async()=>{readBlob++;return null}}),
  baseMimeType:mime,
  mediaAssetsFromOutbox:item=>item.assets,
  messages:()=>({apply:()=>{localUpdates++}}),
  outboxAsLocal:item=>({...item,_local_state:'pending'}),
  wake:async()=>{wakes++}
 };
 vm.createContext(ctx);
 vm.runInContext(code('function uploadedMediaMetadataValid(', 'async function flushMediaItem(')+retry+
  '\nglobalThis.retry=retryFailedMedia;',ctx);
 const args={clientId:'media-client-1',contactId:'CONTACT',
  conversationId:'CONV',accountId:'A',appSessionId:'SA'};
 const ok=await ctx.retry(args);
 assert.equal(ok.ok,true);
 assert.equal(writes,1);
 assert.equal(wakes,1);
 assert.equal(readBlob,0,'uploaded assets must not depend on evicted blob');
 assert.equal(localUpdates,1);
 assert.equal(row.client_id,'media-client-1');
 assert.equal(row.assets[0].uploaded,true);
 assert.equal(row.assets[0].storage_key,'A/CONV/asset-1');
 assert.equal(row.attempts,2);
 assert.equal(row.failed,false);
 assert.equal(row.next_retry_at,0);
 assert.equal((await ctx.retry(args)).reason,'not_failed');
 assert.equal(writes,1,'repeat click does not create a new outbox entry');
 row={...row,failed:true,assets:[{...image,storage_key:'WRONG/CONV/asset-1'}]};
 assert.equal((await ctx.retry(args)).reason,'assets_invalid');
 assert.equal(writes,1);
 row={...row,assets:[{...image,uploaded:false}]};
 assert.equal((await ctx.retry(args)).reason,'asset_unavailable');
 assert.equal(writes,1);
 assert.equal((await ctx.retry({...args,accountId:'B'})).reason,'context_changed');
}
async function wakeCases(){
 let result=false,events=[],owner={accountId:'A',appSessionId:'SA',client:{}};
 const ctx={
  Number,Math,String,Boolean,Promise,
  wakeHint:0,wakePending:false,syncing:false,
  accountId:'A',appSessionId:'SA',client:owner.client,
  captureSyncOwnerContext:()=>({...owner}),
  syncOwnerContextCurrent:o=>o.accountId==='A'&&o.appSessionId==='SA'&&o.client===owner.client,
  doSync:async()=>result,
  cache:()=>({getCursor:async()=>0}),
  online:()=>true,
  queueMicrotask:()=>{},
  shortSyncFenceDelay:async()=>{},
  document:{dispatchEvent:event=>{events.push(event);return true}},
  CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail}}
 };
 vm.createContext(ctx);
 vm.runInContext(wake+'\nglobalThis.fire=wake;',ctx);
 assert.equal(await ctx.fire({reason:'online'}),false,
  'a skipped/failed sync may not report a successful wake');
 assert.equal(events.at(-1).detail.state,'failed');
 result=true;
 assert.equal(await ctx.fire({reason:'online'}),true);
 assert.equal(events.at(-1).detail.state,'completed');
 assert.equal(events.length,2,'one lifecycle notification per completed run');
 // The UI consumes these events; it must not hide the "checking" banner on
 // the browser online signal before canonical catch-up finishes.
 const status=fs.readFileSync('chat-connection-status.js','utf8');
 assert(status.includes("event?.detail?.state==='completed'?'idle':'unstable'"));
 assert(!status.includes('setInterval('));
}
(async()=>{
 await transportCases();
 await retryCases();
 await wakeCases();
 console.log('P1-289 uploaded media resume + strict storage proof, same ID, truthful reconnect PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
