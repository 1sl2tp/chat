(()=>{
'use strict';

const STYLE_ID='v21-chat-image-orientation-style';
const STORAGE_PREFIX='v21-chat-image-rotation:';
let scheduled=0;
let lastOpenedAssetId='';
let observer=null;

function clean(value){return String(value??'').trim();}
function normalizeRotation(value){
  const n=Number(value)||0;
  return ((Math.round(n/90)*90)%360+360)%360;
}
function rotationKey(assetId){return `${STORAGE_PREFIX}${clean(assetId)}`;}
function readRotation(assetId){
  const id=clean(assetId);
  if(!id)return 0;
  try{return normalizeRotation(localStorage.getItem(rotationKey(id)));}catch{return 0;}
}
function writeRotation(assetId,value){
  const id=clean(assetId);
  const next=normalizeRotation(value);
  if(!id)return next;
  try{localStorage.setItem(rotationKey(id),String(next));}catch{}
  return next;
}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .media-image-tile{position:relative}
    .chat-image-rotate-button{
      position:absolute;right:7px;top:7px;z-index:5;width:30px;height:30px;padding:0;border:1px solid rgba(255,255,255,.55);border-radius:999px;
      display:grid;place-items:center;background:rgba(0,0,0,.52);color:#fff;font:700 17px/1 system-ui;cursor:pointer;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)
    }
    .chat-image-rotate-button:focus-visible{outline:2px solid #fff;outline-offset:2px}
    .image-viewer-overlay[open]{
      left:var(--chat-image-viewer-left,var(--image-viewer-left,0px))!important;
      right:var(--chat-image-viewer-right,var(--image-viewer-right,0px))!important;
      top:var(--chat-image-viewer-top,var(--image-viewer-top,0px))!important;
    }
    .chat-image-viewer-rotate-controls{display:flex;align-items:center;gap:.35rem;margin-left:auto;margin-right:.45rem}
    .chat-image-viewer-rotate-controls button{
      width:2.25rem;height:2.25rem;border:1px solid #ffffff2e;border-radius:999px;background:#ffffff14;color:#fff;font:700 1rem/1 system-ui;cursor:pointer
    }
    .chat-image-viewer-rotate-controls button:hover{background:#ffffff28}
    @media(max-width:639px){.chat-image-rotate-button{width:28px;height:28px;right:6px;top:6px}}
  `;
  document.head.appendChild(style);
}
function tileAssetId(tile){return clean(tile?.dataset?.mediaAssetId);}
function activeViewerAssetId(overlay){
  const activeThumb=overlay?.querySelector?.('.image-review-thumbs [aria-current="true"] img[data-asset-id], .image-review-thumb[aria-current="true"] img[data-asset-id]');
  return clean(activeThumb?.dataset?.assetId)||lastOpenedAssetId;
}
function applyTileRotation(tile){
  if(!tile)return;
  const assetId=tileAssetId(tile);
  const img=tile.querySelector('img');
  if(!assetId||!img)return;
  const rotation=readRotation(assetId);
  const quarter=rotation===90||rotation===270;
  img.dataset.chatImageRotation=String(rotation);
  img.style.transformOrigin='center center';
  if(quarter){
    const rect=tile.getBoundingClientRect();
    const width=Math.max(1,Math.round(rect.width));
    const height=Math.max(1,Math.round(rect.height));
    img.style.position='absolute';
    img.style.left='50%';
    img.style.top='50%';
    img.style.width=`${height}px`;
    img.style.height=`${width}px`;
    img.style.maxWidth='none';
    img.style.maxHeight='none';
    img.style.transform=`translate(-50%,-50%) rotate(${rotation}deg)`;
  }else{
    img.style.position='';
    img.style.left='';
    img.style.top='';
    img.style.width='';
    img.style.height='';
    img.style.maxWidth='';
    img.style.maxHeight='';
    img.style.transform=`rotate(${rotation}deg)`;
  }
  let button=tile.querySelector('[data-chat-image-rotate]');
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.className='chat-image-rotate-button';
    button.dataset.chatImageRotate='right';
    button.setAttribute('aria-label','Xoay ảnh 90 độ');
    button.setAttribute('title','Xoay ảnh');
    button.textContent='↻';
    tile.appendChild(button);
  }
}
function applyAllTileRotations(){
  for(const tile of document.querySelectorAll('.media-image-tile[data-media-asset-id]'))applyTileRotation(tile);
}
function updateViewerBounds(){
  const overlay=document.querySelector('.image-viewer-overlay');
  if(!overlay?.open)return;
  const host=document.querySelector('#stageLayout');
  if(!host)return;
  const rect=host.getBoundingClientRect();
  const viewportWidth=Math.max(0,window.innerWidth||document.documentElement.clientWidth||0);
  const topOwner=document.getElementById('regionTop');
  const top=Math.max(rect.top,topOwner?.getBoundingClientRect?.().bottom||rect.top,0);
  overlay.style.setProperty('--chat-image-viewer-left',`${Math.max(0,Math.round(rect.left*100)/100)}px`);
  overlay.style.setProperty('--chat-image-viewer-right',`${Math.max(0,Math.round((viewportWidth-rect.right)*100)/100)}px`);
  overlay.style.setProperty('--chat-image-viewer-top',`${Math.max(0,Math.round(top*100)/100)}px`);
}
function ensureViewerRotateControls(overlay){
  const head=overlay?.querySelector?.('.image-review-head');
  if(!head)return;
  if(head.querySelector('.chat-image-viewer-rotate-controls'))return;
  const controls=document.createElement('div');
  controls.className='chat-image-viewer-rotate-controls';
  controls.innerHTML=`
    <button type="button" data-chat-viewer-rotate-left aria-label="Xoay trái 90 độ" title="Xoay trái">↶</button>
    <button type="button" data-chat-viewer-rotate-right aria-label="Xoay phải 90 độ" title="Xoay phải">↷</button>`;
  const close=head.querySelector('.image-review-close');
  head.insertBefore(controls,close||null);
}
function applyViewerRotation(){
  const overlay=document.querySelector('.image-viewer-overlay');
  if(!overlay?.open)return;
  updateViewerBounds();
  ensureViewerRotateControls(overlay);
  const assetId=activeViewerAssetId(overlay);
  const img=overlay.querySelector('.image-review-image');
  const stage=overlay.querySelector('.image-review-main');
  if(!img||!assetId)return;
  const rotation=readRotation(assetId);
  const quarter=rotation===90||rotation===270;
  img.dataset.chatImageRotation=String(rotation);
  img.style.transformOrigin='center center';
  img.style.transform=`rotate(${rotation}deg)`;
  if(stage&&quarter){
    const rect=stage.getBoundingClientRect();
    img.style.maxWidth=`${Math.max(1,Math.round(rect.height))}px`;
    img.style.maxHeight=`${Math.max(1,Math.round(rect.width))}px`;
  }else{
    img.style.maxWidth='100%';
    img.style.maxHeight='100%';
  }
}
function rotateAsset(assetId,delta){
  const id=clean(assetId);
  if(!id)return false;
  writeRotation(id,readRotation(id)+delta);
  for(const tile of document.querySelectorAll('.media-image-tile[data-media-asset-id]')){
    if(tileAssetId(tile)===id)applyTileRotation(tile);
  }
  applyViewerRotation();
  return true;
}
function handleClick(event){
  const target=event.target instanceof Element?event.target:null;
  if(!target)return;
  const tileRotate=target.closest('[data-chat-image-rotate]');
  if(tileRotate){
    event.preventDefault();
    event.stopPropagation();
    const tile=tileRotate.closest('.media-image-tile');
    rotateAsset(tileAssetId(tile),90);
    return;
  }
  const left=target.closest('[data-chat-viewer-rotate-left]');
  if(left){
    event.preventDefault();
    event.stopPropagation();
    const overlay=left.closest('.image-viewer-overlay');
    rotateAsset(activeViewerAssetId(overlay),-90);
    return;
  }
  const right=target.closest('[data-chat-viewer-rotate-right]');
  if(right){
    event.preventDefault();
    event.stopPropagation();
    const overlay=right.closest('.image-viewer-overlay');
    rotateAsset(activeViewerAssetId(overlay),90);
    return;
  }
  const tile=target.closest('.media-image-tile[data-media-asset-id]');
  if(tile)lastOpenedAssetId=tileAssetId(tile);
}
function sync(){
  scheduled=0;
  installStyle();
  applyAllTileRotations();
  applyViewerRotation();
}
function scheduleSync(){
  if(scheduled)return;
  scheduled=requestAnimationFrame(sync);
}

installStyle();
document.addEventListener('click',handleClick,true);
window.addEventListener('resize',scheduleSync,{passive:true});
observer=new MutationObserver(scheduleSync);
observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['open','aria-current','src','data-media-asset-id']});
queueMicrotask(scheduleSync);
})();
