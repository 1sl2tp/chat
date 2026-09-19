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
    .chat-image-viewer-rotate-controls,
    .image-review-zoom-controls{
      display:flex;align-items:center;height:38px;padding:2px;gap:2px;
      border:1px solid rgba(255,255,255,.16);border-radius:12px;
      background:rgba(255,255,255,.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)
    }
    .chat-image-viewer-rotate-controls{margin-left:auto}
    .image-review-zoom-controls{margin-left:8px;margin-right:8px}
    .chat-image-viewer-rotate-controls button,
    .image-review-zoom-button{
      width:32px;height:32px;padding:0;border:0;border-radius:9px;background:transparent;color:#fff;
      display:grid;place-items:center;cursor:pointer;font:600 18px/1 system-ui;transition:background .14s ease,color .14s ease,opacity .14s ease
    }
    .chat-image-viewer-rotate-controls button:hover,
    .image-review-zoom-button:hover{background:rgba(255,255,255,.13)}
    .chat-image-viewer-rotate-controls button:focus-visible,
    .image-review-zoom-button:focus-visible{outline:2px solid rgba(255,255,255,.82);outline-offset:1px}
    .image-review-zoom-button:disabled{opacity:.32;cursor:default;background:transparent}
    .image-review-zoom-value{
      width:46px;text-align:center;color:rgba(255,255,255,.82);font:600 11px/1 system-ui;
      font-variant-numeric:tabular-nums;user-select:none
    }
    .chat-image-viewer-rotate-controls svg{width:18px;height:18px;display:block}
    @media(max-width:639px){
      .chat-image-rotate-button{width:28px;height:28px;right:6px;top:6px}
      .chat-image-viewer-rotate-controls,.image-review-zoom-controls{height:36px}
      .chat-image-viewer-rotate-controls button,.image-review-zoom-button{width:30px;height:30px}
      .image-review-zoom-controls{margin-left:5px;margin-right:5px}
      .image-review-zoom-value{width:40px;font-size:10px}
    }
    .image-review .chat-image-viewer-rotate-controls,
    .image-review .image-review-zoom-controls{
      border-color:rgba(255,255,255,.14);
      background:rgba(24,25,28,.66);
      box-shadow:0 8px 24px rgba(0,0,0,.18);
      backdrop-filter:blur(16px);
      -webkit-backdrop-filter:blur(16px);
    }
    @media(max-width:700px){
      .image-review .chat-image-viewer-rotate-controls{
        position:fixed;
        z-index:125;
        left:50%;
        bottom:calc(.62rem + env(safe-area-inset-bottom,0px));
        transform:translateX(-7.15rem);
        margin:0;
      }
      .image-review .image-review-zoom-controls{
        position:fixed;
        z-index:125;
        left:50%;
        bottom:calc(.62rem + env(safe-area-inset-bottom,0px));
        transform:translateX(-3.15rem);
        margin:0;
      }
    }
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
function ensureViewerRotateControls(overlay){
  const head=overlay?.querySelector?.('.image-review-head');
  if(!head)return;
  if(head.querySelector('.chat-image-viewer-rotate-controls'))return;
  const controls=document.createElement('div');
  controls.className='chat-image-viewer-rotate-controls';
  controls.innerHTML=`
    <button type="button" data-chat-viewer-rotate-left aria-label="Xoay trái 90 độ" title="Xoay trái">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6H4v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.4 6.1A8 8 0 1 1 5.8 17.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    <button type="button" data-chat-viewer-rotate-right aria-label="Xoay phải 90 độ" title="Xoay phải">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6h5v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.6 6.1A8 8 0 1 0 18.2 17.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>`;
  const close=head.querySelector('.image-review-close');
  const zoom=head.querySelector('.image-review-zoom-controls');
  head.insertBefore(controls,zoom||close||null);
}
function applyViewerRotation(){
  const overlay=document.querySelector('.image-viewer-overlay');
  if(!overlay?.open)return;
  ensureViewerRotateControls(overlay);
  const assetId=activeViewerAssetId(overlay);
  const img=overlay.querySelector('.image-review-image');
  const stage=overlay.querySelector('.image-review-main');
  if(!img||!assetId)return;
  const rotation=readRotation(assetId);
  const quarter=rotation===90||rotation===270;
  img.dataset.chatImageRotation=String(rotation);
  img.style.transformOrigin='center center';
  if(stage&&quarter){
    const rect=stage.getBoundingClientRect();
    img.style.maxWidth=`${Math.max(1,Math.round(rect.height))}px`;
    img.style.maxHeight=`${Math.max(1,Math.round(rect.width))}px`;
  }else{
    img.style.maxWidth='100%';
    img.style.maxHeight='100%';
  }
  window.V21ImageViewerVisual?.applyTransform?.();
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
