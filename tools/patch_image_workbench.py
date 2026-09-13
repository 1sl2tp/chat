from pathlib import Path

path = Path('app.js')
text = path.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    text = text.replace(old, new, 1)

state_anchor = "const imageViewerOwnedUrls=new Map();\n"
state_block = r'''const imageViewerOwnedUrls=new Map();
const IMAGE_VIEWER_ROTATION_KEY='taphoa.chat.v21.imageViewerRotations';
const imageViewerRotations=new Map();
let imageViewerZoom=1;
let imageViewerPanX=0;
let imageViewerPanY=0;
let imageViewerPointerId=null;
let imageViewerPointerStartX=0;
let imageViewerPointerStartY=0;
let imageViewerPointerBaseX=0;
let imageViewerPointerBaseY=0;
let imageViewerZoomLabel=null;

function loadImageViewerRotations(){
  try{
    const raw=localStorage.getItem(IMAGE_VIEWER_ROTATION_KEY);
    const values=raw?JSON.parse(raw):null;
    if(!values||typeof values!=='object')return;
    for(const [assetId,value] of Object.entries(values)){
      const rotation=((Number(value)||0)%360+360)%360;
      if(assetId&&[0,90,180,270].includes(rotation))imageViewerRotations.set(assetId,rotation);
    }
  }catch(_error){}
}

function persistImageViewerRotations(){
  try{
    localStorage.setItem(IMAGE_VIEWER_ROTATION_KEY,JSON.stringify(Object.fromEntries(imageViewerRotations)));
  }catch(_error){}
}

function activeImageViewerAssetId(){
  return String(imageViewerItems[imageViewerIndex]?.assetId||'');
}

function imageViewerRotation(assetId=activeImageViewerAssetId()){
  return Number(imageViewerRotations.get(String(assetId||'')))||0;
}

function applyImageViewerTransform(){
  if(!imageViewerImage)return false;
  const rotation=imageViewerRotation();
  imageViewerImage.style.transform=`translate3d(${imageViewerPanX}px,${imageViewerPanY}px,0) scale(${imageViewerZoom}) rotate(${rotation}deg)`;
  if(imageViewerZoomLabel)imageViewerZoomLabel.textContent=`${Math.round(imageViewerZoom*100)}%`;
  if(imageViewerMain)imageViewerMain.dataset.zoomed=imageViewerZoom>1.001?'true':'false';
  return true;
}

function rotateImageViewer(delta){
  const assetId=activeImageViewerAssetId();
  if(!assetId)return false;
  const next=((imageViewerRotation(assetId)+Number(delta||0))%360+360)%360;
  imageViewerRotations.set(assetId,next);
  persistImageViewerRotations();
  imageViewerPanX=0;
  imageViewerPanY=0;
  return applyImageViewerTransform();
}

function zoomImageViewer(delta){
  imageViewerZoom=Math.max(.5,Math.min(4,Math.round((imageViewerZoom+Number(delta||0))*100)/100));
  if(imageViewerZoom<=1){imageViewerPanX=0;imageViewerPanY=0;}
  return applyImageViewerTransform();
}

function fitImageViewer(){
  imageViewerZoom=1;
  imageViewerPanX=0;
  imageViewerPanY=0;
  return applyImageViewerTransform();
}

function ensureImageViewerWorkbenchStyles(){
  if(document.getElementById('imageViewerWorkbenchStyles'))return;
  const style=document.createElement('style');
  style.id='imageViewerWorkbenchStyles';
  style.textContent=`
/* #imageViewerWorkbenchStyles: Chat-owned non-modal image workbench. */
.image-viewer-overlay[open]{
  position:fixed!important;
  inset:auto!important;
  top:calc(var(--image-viewer-top,0px) + 8px)!important;
  right:max(8px,var(--image-viewer-right,0px))!important;
  left:auto!important;
  bottom:auto!important;
  width:min(540px,calc(100vw - var(--image-viewer-left,0px) - var(--image-viewer-right,0px) - 16px))!important;
  height:min(70vh,680px)!important;
  max-width:none!important;
  max-height:none!important;
  margin:0!important;
  padding:0!important;
  border:1px solid rgba(15,23,42,.16)!important;
  border-radius:16px!important;
  background:#fff!important;
  color:#111827!important;
  box-shadow:0 16px 42px rgba(15,23,42,.2)!important;
  overflow:hidden!important;
  z-index:35!important;
  pointer-events:auto!important;
}
.image-viewer-overlay::backdrop{display:none!important;background:transparent!important;}
.image-viewer-overlay .image-review{background:#fff!important;color:#111827!important;}
.image-viewer-overlay .image-review-head{background:#fff!important;color:#111827!important;border-bottom:1px solid rgba(15,23,42,.1)!important;gap:8px!important;}
.image-viewer-overlay .image-review-heading{min-width:0!important;flex:1 1 auto!important;}
.image-viewer-overlay .image-review-main{position:relative!important;min-height:0!important;overflow:hidden!important;background:#111!important;touch-action:none!important;cursor:default!important;}
.image-viewer-overlay .image-review-main[data-zoomed="true"]{cursor:grab!important;}
.image-viewer-overlay .image-review-main[data-panning="true"]{cursor:grabbing!important;}
.image-viewer-overlay .image-review-image{max-width:100%!important;max-height:100%!important;object-fit:contain!important;transform-origin:center center!important;will-change:transform;user-select:none!important;-webkit-user-drag:none;}
.image-viewer-overlay .image-review-bottom{background:#fff!important;color:#111827!important;border-top:1px solid rgba(15,23,42,.08)!important;}
.image-workbench-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex:0 0 auto;}
.image-workbench-tool{display:grid;place-items:center;min-width:32px;height:32px;padding:0 8px;border:1px solid rgba(15,23,42,.12);border-radius:9px;background:#f8fafc;color:#111827;font:600 13px/1 system-ui,sans-serif;cursor:pointer;}
.image-workbench-tool:hover{background:#f1f5f9;}
.image-workbench-zoom{min-width:48px;font-variant-numeric:tabular-nums;}
@media (max-width: 759px){
  .image-viewer-overlay[open]{
    top:calc(var(--image-viewer-top,0px) + 6px)!important;
    right:8px!important;
    left:8px!important;
    width:auto!important;
    height:min(44vh,420px)!important;
    border-radius:14px!important;
  }
  .image-viewer-overlay .image-review-title{font-size:14px!important;}
  .image-viewer-overlay .image-review-count{font-size:11px!important;}
  .image-workbench-toolbar{gap:2px;}
  .image-workbench-tool{min-width:30px;height:30px;padding:0 6px;font-size:12px;}
  .image-workbench-zoom{min-width:42px;}
  .image-viewer-overlay .image-review-bottom{max-height:82px!important;overflow:hidden!important;}
}
`;
  document.head.appendChild(style);
}

function imageViewerToolButton(label,text,onClick,{className=''}={}){
  const button=document.createElement('button');
  button.type='button';
  button.className=`image-workbench-tool ${className}`.trim();
  button.setAttribute('aria-label',label);
  button.title=label;
  button.textContent=text;
  button.addEventListener('click',event=>{event.stopPropagation();onClick?.();});
  return button;
}

loadImageViewerRotations();
'''
replace_once(state_anchor, state_block, 'state block')

old_enter = r'''function enterImageViewerMode(){
  setComposerActionMenuOpen(false);
  if(!appShell)return false;
  const lease=InteractionController.enter(InteractionMode.IMAGE_VIEWER,{
    owner:'image-viewer',
    lockBaseUi:true
  });
  if(!lease)return false;
  appShell.dataset.imageViewerMode='true';
  return true;
}

function exitImageViewerMode(){
  if(appShell)delete appShell.dataset.imageViewerMode;
  InteractionController.exit(InteractionMode.IMAGE_VIEWER,{owner:'image-viewer'});
}
'''
new_enter = r'''function enterImageViewerMode(){
  setComposerActionMenuOpen(false);
  if(!appShell)return false;
  // Image inspection is a non-modal Chat workbench. It must not lease the
  // exclusive InteractionController because Composer/order entry stays usable.
  appShell.dataset.imageViewerMode='true';
  return true;
}

function exitImageViewerMode(){
  if(appShell)delete appShell.dataset.imageViewerMode;
}
'''
replace_once(old_enter, new_enter, 'non-modal interaction owner')

old_close = r'''  if(imageViewerOverlay?.open)imageViewerOverlay.close();
  unlockAppHeaderForImageViewer();
  exitImageViewerMode();
'''
new_close = r'''  if(imageViewerOverlay?.open)imageViewerOverlay.close();
  imageViewerPointerId=null;
  imageViewerZoom=1;
  imageViewerPanX=0;
  imageViewerPanY=0;
  exitImageViewerMode();
'''
replace_once(old_close, new_close, 'close workbench')

old_ensure = "function ensureImageViewer(){\n  if(imageViewerOverlay)return imageViewerOverlay;\n"
new_ensure = "function ensureImageViewer(){\n  ensureImageViewerWorkbenchStyles();\n  if(imageViewerOverlay)return imageViewerOverlay;\n"
replace_once(old_ensure, new_ensure, 'ensure styles')

old_head = "  head.append(heading,close);\n\n  const main=document.createElement('div');\n"
new_head = r'''  const toolbar=document.createElement('div');
  toolbar.className='image-workbench-toolbar';
  const rotateLeft=imageViewerToolButton('Xoay trái','↶',()=>rotateImageViewer(-90));
  const zoomOut=imageViewerToolButton('Thu nhỏ','−',()=>zoomImageViewer(-.25));
  const zoomLabel=document.createElement('span');
  zoomLabel.className='image-workbench-tool image-workbench-zoom';
  zoomLabel.setAttribute('aria-label','Mức phóng');
  zoomLabel.textContent='100%';
  const zoomIn=imageViewerToolButton('Phóng to','+',()=>zoomImageViewer(.25));
  const fit=imageViewerToolButton('Vừa khung','Vừa',()=>fitImageViewer());
  const rotateRight=imageViewerToolButton('Xoay phải','↷',()=>rotateImageViewer(90));
  toolbar.append(rotateLeft,zoomOut,zoomLabel,zoomIn,fit,rotateRight);
  head.append(heading,toolbar,close);

  const main=document.createElement('div');
'''
replace_once(old_head, new_head, 'toolbar')

old_touch = r'''  main.addEventListener('touchstart',event=>{
    imageViewerSwipeStartX=event.changedTouches?.[0]?.screenX||0;
  },{passive:true});
  main.addEventListener('touchend',event=>{
    const endX=event.changedTouches?.[0]?.screenX||0;
    const dx=endX-imageViewerSwipeStartX;
    if(Math.abs(dx)>45)void showImageViewerIndex(imageViewerIndex+(dx<0?1:-1));
  },{passive:true});
'''
new_touch = r'''  main.addEventListener('touchstart',event=>{
    if(imageViewerZoom>1.001)return;
    imageViewerSwipeStartX=event.changedTouches?.[0]?.screenX||0;
  },{passive:true});
  main.addEventListener('touchend',event=>{
    if(imageViewerZoom>1.001)return;
    const endX=event.changedTouches?.[0]?.screenX||0;
    const dx=endX-imageViewerSwipeStartX;
    if(Math.abs(dx)>45)void showImageViewerIndex(imageViewerIndex+(dx<0?1:-1));
  },{passive:true});
  main.addEventListener('pointerdown',event=>{
    if(imageViewerZoom<=1.001||event.button!==0||event.target?.closest?.('button'))return;
    imageViewerPointerId=event.pointerId;
    imageViewerPointerStartX=event.clientX;
    imageViewerPointerStartY=event.clientY;
    imageViewerPointerBaseX=imageViewerPanX;
    imageViewerPointerBaseY=imageViewerPanY;
    main.dataset.panning='true';
    try{main.setPointerCapture(event.pointerId);}catch(_error){}
  });
  main.addEventListener('pointermove',event=>{
    if(imageViewerPointerId!==event.pointerId)return;
    imageViewerPanX=imageViewerPointerBaseX+(event.clientX-imageViewerPointerStartX);
    imageViewerPanY=imageViewerPointerBaseY+(event.clientY-imageViewerPointerStartY);
    applyImageViewerTransform();
  });
  const endPan=event=>{
    if(imageViewerPointerId!==event.pointerId)return;
    imageViewerPointerId=null;
    delete main.dataset.panning;
    try{main.releasePointerCapture(event.pointerId);}catch(_error){}
  };
  main.addEventListener('pointerup',endPan);
  main.addEventListener('pointercancel',endPan);
  main.addEventListener('wheel',event=>{
    if(!event.ctrlKey&&!event.metaKey)return;
    event.preventDefault();
    zoomImageViewer(event.deltaY<0?.2:-.2);
  },{passive:false});
'''
replace_once(old_touch, new_touch, 'pan and swipe')

old_refs = r'''  imageViewerPrev=prev;
  imageViewerNext=next;
  return overlay;
}
'''
new_refs = r'''  imageViewerPrev=prev;
  imageViewerNext=next;
  imageViewerZoomLabel=zoomLabel;
  applyImageViewerTransform();
  return overlay;
}
'''
replace_once(old_refs, new_refs, 'zoom label ref')

old_show_index = r'''  imageViewerIndex=nextIndex;
  updateImageViewerChrome();
'''
new_show_index = r'''  imageViewerIndex=nextIndex;
  fitImageViewer();
  updateImageViewerChrome();
'''
replace_once(old_show_index, new_show_index, 'reset view on image change')

old_open_modal = r'''  if(!imageViewerOverlay.open){
    imageViewerReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(!enterImageViewerMode()){
      imageViewerReturnFocus=null;
      return false;
    }
    positionImageViewerBelowHeader();
    lockAppHeaderForImageViewer();
    try{
      if(typeof imageViewerOverlay.showModal==='function')imageViewerOverlay.showModal();
      else imageViewerOverlay.show();
    }catch(error){
      unlockAppHeaderForImageViewer();
      exitImageViewerMode();
      throw error;
    }
    requestAnimationFrame(()=>imageViewerOverlay.querySelector('.image-review-close')?.focus({preventScroll:true}));
  }else{
    positionImageViewerBelowHeader();
  }
'''
new_open_modal = r'''  if(!imageViewerOverlay.open){
    imageViewerReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(!enterImageViewerMode()){
      imageViewerReturnFocus=null;
      return false;
    }
    positionImageViewerBelowHeader();
    try{
      // Non-modal dialog: Chat, Composer and order-entry controls remain live.
      imageViewerOverlay.show();
    }catch(error){
      exitImageViewerMode();
      throw error;
    }
  }else{
    positionImageViewerBelowHeader();
  }
'''
replace_once(old_open_modal, new_open_modal, 'open non-modal workbench')

path.write_text(text, encoding='utf-8')
print('patched app.js docked image workbench')
