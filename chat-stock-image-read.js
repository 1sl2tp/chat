// CHAT-417: user-initiated OCR on the current KH photo, inside the browser.
// No Gemini, Supabase Edge OCR, DB/Storage writes or background scans.
// The photo stays on this device; only the OCR engine/language data are loaded.
(()=>{'use strict';
const OCR_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
const OCR_WORKER='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js';
const MAX_BYTES=4000000;
const cache=new Map(),inflight=new Map();
let scope='',capability=null,loader=null,scanQueue=Promise.resolve();
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
 return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu
  .test(String(assetId||''));
}
function peek(assetId){
 const who=owner();
 return who&&allowedAsset(assetId)?cache.get(who.key+'::'+assetId)||null:null;
}
function availability(){
 const who=owner();
 return who&&scope===who.key?capability:null;
}
// Local platform capability only. NEVER contact the Edge function.
async function checkReady(){
 const who=owner();
 if(!who)return false;
 if(scope!==who.key){scope=who.key;capability=null;}
 if(capability!==null)return capability;
 capability=Boolean(window.Worker&&window.WebAssembly&&document.createElement&&
  window.V21ChatStockOCRRules?.parse);
 document.dispatchEvent(new Event('v21-stock-image-capability'));
 return capability;
}
function loadOCR(){
 if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
 if(loader)return loader;
 loader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=OCR_SCRIPT;script.async=true;script.crossOrigin='anonymous';
  script.onload=()=>window.Tesseract?.createWorker?
   resolve(window.Tesseract):reject(Error('ocr_engine_unavailable'));
  script.onerror=()=>reject(Error('ocr_engine_unavailable'));
  document.head.appendChild(script);
 }).catch(error=>{loader=null;throw error;});
 return loader;
}
async function prepareImage(blob){
 if(!(blob instanceof Blob))throw Error('image_unavailable');
 if(blob.type==='image/jpg'&&blob.size<=MAX_BYTES)
  return new Blob([blob],{type:'image/jpeg'});
 if(['image/jpeg','image/png','image/webp'].includes(blob.type)&&blob.size<=MAX_BYTES)
  return blob;
 // Oversized/unsupported image: a temporary canvas copy, not a new message.
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
  const data=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.83));
  if(!data||data.size>MAX_BYTES)throw Error('image_too_large');
  return data;
 }finally{bitmap?.close?.();}
}
async function readBlob(image,onProgress){
 onProgress('Đang mở OCR…');
 const tesseract=await loadOCR();
 let worker=null;
 try{
  worker=await tesseract.createWorker(['vie','eng'],1,{
   workerPath:OCR_WORKER,
   logger:state=>{
    if(state?.status==='recognizing text'){
     const percent=Math.round(Math.max(0,Math.min(1,Number(state.progress)||0))*100);
     onProgress('Đang nhận chữ '+percent+'%');
    }else if(state?.status==='loading language traineddata')onProgress('Đang tải bộ chữ tiếng Việt…');
   }
  });
  const result=await worker.recognize(image);
  return String(result?.data?.text||'').slice(0,16000);
 }catch{
  throw Error('ocr_engine_unavailable');
 }finally{if(worker)try{await worker.terminate();}catch{}}
}
async function scan(assetId,onProgress=()=>{},force=false){
 const who=owner();
 if(!who)throw Error('admin_required');
 if(!allowedAsset(assetId))throw Error('invalid_asset');
 if(!(await checkReady()))throw Error('ocr_unsupported');
 const key=who.key+'::'+assetId;
 if(force)cache.delete(key);
 if(cache.has(key))return cache.get(key);
 if(inflight.has(key))return inflight.get(key);
 const job=async()=>{
  let row=await window.V21MediaCache?.get?.({accountId:who.accountId,assetId});
  if(!(row?.blob instanceof Blob)){
   row=await window.V21SyncEngine?.ensureMediaRemote?.({
    accountId:who.accountId,assetId
   })||row;
  }
  if(!(row?.blob instanceof Blob))throw Error('image_unavailable');
  if(owner()?.key!==who.key)throw Error('conversation_switched');
  const image=await prepareImage(row.blob);
  if(owner()?.key!==who.key)throw Error('conversation_switched');
  const text=await readBlob(image,onProgress);
  if(owner()?.key!==who.key)throw Error('conversation_switched');
  const parsed=window.V21ChatStockOCRRules.parse(text);
  const result={
   status:parsed.classification==='typed_stock_list'?'read':'other',
   // Keep all OCR characters for side-by-side human comparison.
   rawText:parsed.raw_text,textLines:parsed.text_lines,
   lines:parsed.lines,notes:parsed.notes,assetId
  };
  cache.set(key,result);
  return result;
 };
 // Only one heavyweight WASM OCR worker active per tab, especially on iOS.
 const pending=scanQueue.then(job,job);
 scanQueue=pending.catch(()=>{});
 inflight.set(key,pending);
 try{return await pending;}finally{inflight.delete(key);}
}
function updateText(assetId,text){
 const who=owner();
 if(!who||!allowedAsset(assetId)||typeof text!=='string'||text.length>16000)return null;
 const key=who.key+'::'+assetId;
 const previous=cache.get(key);
 if(!previous)return null;
 const parsed=window.V21ChatStockOCRRules.parse(text);
 const updated={...previous,
  status:parsed.classification==='typed_stock_list'?'read':'other',
  rawText:parsed.raw_text,textLines:parsed.text_lines,
  lines:parsed.lines,notes:parsed.notes,edited:true
 };
 cache.set(key,updated);
 return updated;
}
function clear(){
 cache.clear();inflight.clear();scope='';capability=null;
}
document.addEventListener('v21-auth-state',event=>{
 if(event.detail?.state!=='AUTHENTICATED')clear();
});
window.V21ChatStockImageRead=Object.freeze({
 scan,peek,updateText,clear,owner,availability,checkReady
});
})();
