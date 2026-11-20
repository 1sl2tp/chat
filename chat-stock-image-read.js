// CHAT-409: opt-in printed stock-list OCR for existing customer image messages.
// In-memory, current authenticated Admin+conversation only. Images never get
// copied into drafts/outbox or sent as new messages. No automatic paid scans.
(()=>{'use strict';
const FUNCTION='v21-ncc-ai-room';
const cache=new Map();
const inflight=new Map();
const MAX_BYTES=4000000;
function owner(){
 const auth=window.V21AuthSessionStore?.snapshot?.()||{};
 const sync=window.V21SyncEngine?.snapshot?.()||{};
 if(auth.state!=='AUTHENTICATED'||auth.account?.role!=='admin'||
   !auth.account?.id||!auth.appSessionId||!sync.currentConversationId)return null;
 const accountId=String(auth.account.id);
 const conversationId=String(sync.currentConversationId);
 const sessionId=String(auth.appSessionId);
 return {accountId,conversationId,sessionId,
  key:[accountId,sessionId,conversationId].join('|')};
}
function allowedAsset(assetId){
 return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(String(assetId||''));
}
function recordKey(who,assetId){return who?.key+'::'+assetId;}
function peek(assetId){
 const who=owner();
 return who&&allowedAsset(assetId)?cache.get(recordKey(who,assetId))||null:null;
}
function fileBase64(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('image_read_unavailable'));
  reader.onload=()=>{
   const contents=String(reader.result||'');
   const b64=contents.slice(contents.indexOf(',')+1);
   b64?resolve(b64):reject(Error('image_read_unavailable'));
  };
  reader.readAsDataURL(file);
 });
}
async function prepareImage(blob){
 if(!(blob instanceof Blob))throw Error('image_unavailable');
 if(['image/jpeg','image/png','image/webp'].includes(blob.type)&&blob.size<=MAX_BYTES)return blob;
 // Resize locally, never change the stored/original image.
 if(typeof createImageBitmap!=='function')throw Error('image_too_large');
 let bitmap=null;
 try{
  bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'});
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('image_read_unavailable');
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const data=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
  if(!data||data.size>MAX_BYTES)throw Error('image_too_large');
  return data;
 }finally{bitmap?.close?.();}
}
async function scan(assetId){
 const who=owner();
 if(!who)throw Error('admin_required');
 if(!allowedAsset(assetId))throw Error('invalid_asset');
 const key=recordKey(who,assetId);
 if(cache.has(key))return cache.get(key);
 if(inflight.has(key))return inflight.get(key);
 const job=(async()=>{
  let row=await window.V21MediaCache?.get?.({accountId:who.accountId,assetId});
  if(!(row?.blob instanceof Blob)){
   row=await window.V21SyncEngine?.ensureMediaRemote?.({
    accountId:who.accountId,assetId
   })||row;
  }
  if(!(row?.blob instanceof Blob))throw Error('image_unavailable');
  if(owner()?.key!==who.key)throw Error('conversation_switched');
  const image=await prepareImage(row.blob);
  const base64=await fileBase64(image);
  if(owner()?.key!==who.key)throw Error('conversation_switched');
  const client=window.V21AuthSessionStore?.getClient?.();
  if(!client)throw Error('admin_required');
  const {data,error}=await client.functions.invoke(FUNCTION,{body:{
   action:'chat_stock_image',mime:image.type,base64
  }});
  if(error||!data?.ok)throw Error(String(data?.code||'ai_unavailable'));
  if(owner()?.key!==who.key)throw Error('conversation_switched');
  const valid=Array.isArray(data.lines)?data.lines.slice(0,60):[];
  const result={
   status:data.classification==='typed_stock_list'?'read':'other',
   lines:valid.filter(line=>line&&typeof line.name==='string'&&
     Number.isSafeInteger(Number(line.qty))&&Number(line.qty)>0).map(line=>({
     name:String(line.name).trim().slice(0,120),
     qty:Number(line.qty),unit:String(line.unit||'').slice(0,25),
     raw:String(line.raw||'').slice(0,260),review:true
   })),
   notes:Array.isArray(data.notes)?data.notes.slice(0,60).map(x=>String(x).slice(0,240)):[],
   assetId
  };
  cache.set(key,result);
  return result;
 })().finally(()=>inflight.delete(key));
 inflight.set(key,job);
 return job;
}
function clear(){cache.clear();inflight.clear();}
document.addEventListener('v21-auth-state',event=>{
 if(event.detail?.state!=='AUTHENTICATED')clear();
});
window.V21ChatStockImageRead=Object.freeze({scan,peek,clear,owner});
})();