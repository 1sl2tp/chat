(()=>{
'use strict';

if(typeof document==='undefined')return;

const STYLE_ID='v21-order-source-image-viewer-style';
const ROTATION_KEY='v21-order-source-image-rotation:';
const MAX_ZOOM=3;
const MIN_ZOOM=0.6;
let activeAssetId='';
let objectUrl='';
let loading=false;
let error='';
let zoom=1;
let rotation=0;
let panX=0;
let panY=0;
let drag=null;
let observer=null;

function clean(value){return String(value??'').trim();}
function authStore(){return globalThis.V21AuthSessionStore||null;}
function mediaCache(){return globalThis.V21MediaCache||null;}
function currentAccountId(){return clean(authStore()?.snapshot?.()?.account?.id);}
function group(){return globalThis.__V21LastOrderSourceGroup||null;}
function images(){return (Array.isArray(group()?.images)?group().images:[]).filter(image=>clean(image?.assetId));}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
function normalizeRotation(value){
  const n=Number(value)||0;
  return ((n%360)+360)%360;
}
function rotationKey(assetId){return `${ROTATION_KEY}${assetId}`;}
function loadRotation(assetId){
  try{return normalizeRotation(localStorage.getItem(rotationKey(assetId)));}catch{return 0;}
}
function saveRotation(assetId,value){
  try{localStorage.setItem(rotationKey(assetId),String(normalizeRotation(value)));}catch{}
}
function revokeObjectUrl(){
  if(objectUrl){try{URL.revokeObjectURL(objectUrl);}catch{}}
  objectUrl='';
}
function resetViewport(){zoom=1;panX=0;panY=0;}
function selectAsset(assetId){
  const id=clean(assetId);
  if(!id||id===activeAssetId)return false;
  revokeObjectUrl();
  activeAssetId=id;
  rotation=loadRotation(id);
  resetViewport();
  error='';
  loading=false;
  return true;
}
function ensureSelection(){
  const list=images();
  if(!list.length){
    revokeObjectUrl();
    activeAssetId='';
    return false;
  }
  if(!list.some(image=>clean(image.assetId)===activeAssetId))selectAsset(list[0].assetId);
  return true;
}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .order-source-images[data-inline-image-viewer="true"]{display:grid;gap:7px;padding:7px;background:var(--theme-surface-secondary,#f6f6f6)}
    .order-source-image-tabs{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none}.order-source-image-tabs::-webkit-scrollbar{display:none}
    .order-source-image-tabs button{flex:0 0 auto;min-height:28px;padding:0 9px;border:1px solid var(--theme-border-default,#ddd);border-radius:8px;background:var(--theme-surface-primary,#fff);font-size:11px;cursor:pointer}.order-source-image-tabs button[aria-pressed="true"]{border-color:#10a37f;color:#08765a;font-weight:700}
    .order-source-image-viewer{display:grid;grid-template-rows:auto minmax(0,1fr);gap:6px;min-width:0}
    .order-source-image-toolbar{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.order-source-image-toolbar button{min-width:31px;height:30px;padding:0 8px;border:1px solid var(--theme-border-default,#ddd);border-radius:8px;background:var(--theme-surface-primary,#fff);font-size:12px;cursor:pointer}.order-source-image-toolbar output{min-width:44px;text-align:center;font-size:11px;color:var(--theme-content-secondary,#666)}
    .order-source-image-stage{position:relative;height:clamp(210px,38vh,390px);overflow:hidden;border:1px solid var(--theme-border-default,#ddd);border-radius:9px;background:#ececec;touch-action:none;cursor:grab;overscroll-behavior:contain;user-select:none;-webkit-user-select:none}
    .order-source-image-stage[data-dragging="true"]{cursor:grabbing}
    .order-source-image-stage img{position:absolute;inset:50% auto auto 50%;max-width:92%;max-height:92%;object-fit:contain;transform-origin:center center;will-change:transform;pointer-events:none;-webkit-user-drag:none}
    .order-source-image-state{position:absolute;inset:0;display:grid;place-items:center;padding:18px;text-align:center;font-size:12px;color:var(--theme-content-secondary,#666)}
    @media(max-width:639px){.order-source-image-stage{height:clamp(190px,32vh,310px)}}
  `;
  document.head.appendChild(style);
}
function transformValue(){
  return `translate(calc(-50% + ${panX}px),calc(-50% + ${panY}px)) scale(${zoom}) rotate(${rotation}deg)`;
}
function viewerHtml(list){
  const tabs=list.map((image,index)=>{
    const id=clean(image.assetId);
    return `<button type="button" data-source-image-select="${id}" aria-pressed="${String(id===activeAssetId)}">Ảnh ${index+1}</button>`;
  }).join('');
  const body=objectUrl
    ?`<img alt="Ảnh khách gửi" src="${objectUrl}" style="transform:${transformValue()}">`
    :`<div class="order-source-image-state">${loading?'Đang tải ảnh…':(error||'Bấm ảnh để xem')}</div>`;
  return `<div class="order-source-image-tabs">${tabs}</div>
    <div class="order-source-image-viewer">
      <div class="order-source-image-toolbar">
        <button type="button" data-source-image-action="rotate-left" aria-label="Xoay trái">↶</button>
        <button type="button" data-source-image-action="rotate-right" aria-label="Xoay phải">↷</button>
        <button type="button" data-source-image-action="zoom-out" aria-label="Thu nhỏ">−</button>
        <output>${Math.round(zoom*100)}%</output>
        <button type="button" data-source-image-action="zoom-in" aria-label="Phóng to">+</button>
        <button type="button" data-source-image-action="fit">Vừa khung</button>
      </div>
      <div class="order-source-image-stage" data-source-image-stage data-dragging="${String(Boolean(drag))}">${body}</div>
    </div>`;
}
function renderViewer(){
  installStyle();
  const host=document.querySelector('#adminOrderSourcePanel .order-source-images');
  const list=images();
  if(!host||!list.length)return false;
  ensureSelection();
  host.dataset.inlineImageViewer='true';
  const key=[list.map(item=>clean(item.assetId)).join(','),activeAssetId,objectUrl,loading,error,zoom,rotation,panX,panY,Boolean(drag)].join('|');
  if(host.dataset.inlineViewerKey===key)return true;
  host.dataset.inlineViewerKey=key;
  host.innerHTML=viewerHtml(list);
  return true;
}
async function hydrateActive(){
  if(!activeAssetId||objectUrl||loading)return;
  const accountId=currentAccountId();
  const client=authStore()?.getClient?.();
  const cache=mediaCache();
  if(!accountId||!client||!cache?.ensureRemote){error='Không tải được ảnh.';renderViewer();return;}
  loading=true;error='';renderViewer();
  const target=activeAssetId;
  try{
    let row=await cache.get?.({accountId,assetId:target});
    if(!(row?.blob instanceof Blob))row=await cache.ensureRemote({accountId,assetId:target,client});
    if(target!==activeAssetId)return;
    if(!(row?.blob instanceof Blob))throw new Error('image_unavailable');
    revokeObjectUrl();
    objectUrl=URL.createObjectURL(row.blob);
  }catch{
    if(target===activeAssetId)error='Không tải được ảnh.';
  }finally{
    if(target===activeAssetId)loading=false;
    renderViewer();
  }
}
function setZoom(next){
  zoom=clamp(Math.round(next*100)/100,MIN_ZOOM,MAX_ZOOM);
  if(zoom<=1){panX=0;panY=0;}
  renderViewer();
}
function rotate(delta){
  if(!activeAssetId)return;
  rotation=normalizeRotation(rotation+delta);
  saveRotation(activeAssetId,rotation);
  panX=0;panY=0;
  renderViewer();
}
function fit(){resetViewport();renderViewer();}
function actionFrom(target){return target?.closest?.('[data-source-image-action]')?.dataset?.sourceImageAction||'';}
function onClick(event){
  const select=event.target?.closest?.('[data-source-image-select]');
  if(select){
    if(selectAsset(select.dataset.sourceImageSelect)){renderViewer();void hydrateActive();}
    return;
  }
  const action=actionFrom(event.target);
  if(!action)return;
  if(action==='rotate-left')rotate(-90);
  else if(action==='rotate-right')rotate(90);
  else if(action==='zoom-out')setZoom(zoom-0.2);
  else if(action==='zoom-in')setZoom(zoom+0.2);
  else if(action==='fit')fit();
}
function onPointerDown(event){
  const stage=event.target?.closest?.('[data-source-image-stage]');
  if(!stage||!objectUrl||zoom<=1)return;
  drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,panX,panY};
  try{stage.setPointerCapture(event.pointerId);}catch{}
  renderViewer();
}
function onPointerMove(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  panX=drag.panX+(event.clientX-drag.startX);
  panY=drag.panY+(event.clientY-drag.startY);
  renderViewer();
}
function stopDrag(event){
  if(!drag||(event?.pointerId!=null&&event.pointerId!==drag.pointerId))return;
  drag=null;renderViewer();
}
function onWheel(event){
  const stage=event.target?.closest?.('[data-source-image-stage]');
  if(!stage||!objectUrl)return;
  event.preventDefault();
  setZoom(zoom+(event.deltaY<0?0.15:-0.15));
}
function sync(){
  const host=document.querySelector('#adminOrderSourcePanel .order-source-images');
  if(!host)return;
  if(!ensureSelection())return;
  renderViewer();
  void hydrateActive();
}

installStyle();
document.addEventListener('click',onClick);
document.addEventListener('pointerdown',onPointerDown);
document.addEventListener('pointermove',onPointerMove);
document.addEventListener('pointerup',stopDrag);
document.addEventListener('pointercancel',stopDrag);
document.addEventListener('wheel',onWheel,{passive:false});
observer=new MutationObserver(()=>sync());
observer.observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('v21-auth-state',event=>{if(event?.detail?.state!=='AUTHENTICATED'){revokeObjectUrl();activeAssetId='';}});
window.addEventListener('beforeunload',revokeObjectUrl,{once:true});

queueMicrotask(sync);
})();
