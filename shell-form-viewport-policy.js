(()=>{
'use strict';

const RELEASE_VERSION='V21.72.37';
const MODULE_CONTRACT_VERSION='shell-form-viewport-v3';
const KEYBOARD_THRESHOLD_PX=80;
const EDGE_PX=12;

const vv=window.visualViewport||null;
let restingVisualHeight=Math.max(1,Math.round(vv?.height||window.innerHeight||1));
let activeField=null;
let activeOwner=null;
let frame=0;

function mobileRuntime(){
  return Boolean(
    Number(navigator.maxTouchPoints||0)>0 ||
    window.matchMedia?.('(pointer:coarse)')?.matches ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent||'')
  );
}

function isFormField(node){
  return Boolean(node?.matches?.('input,textarea,select,[contenteditable="true"]'));
}

function ownerFor(node){
  if(!isFormField(node))return null;

  const profileCard=node.closest?.('.shell-profile-card')||null;
  if(profileCard){
    const overlay=profileCard.closest?.('.shell-profile-overlay')||null;
    if(overlay)return{kind:'profile',surface:profileCard,host:overlay};
  }

  const auth=node.closest?.('#guestAuthThread')||null;
  if(auth)return{kind:'auth',surface:auth,host:auth};

  return null;
}

function sameOwner(a,b){
  return Boolean(a&&b&&a.kind===b.kind&&a.surface===b.surface&&a.host===b.host);
}

function nodesFor(owner){
  return owner?[...new Set([owner.host,owner.surface].filter(Boolean))]:[];
}

function clearKeyboardState(owner){
  for(const node of nodesFor(owner)){
    delete node.dataset.mobileKeyboard;
    node.style?.removeProperty?.('--shell-form-keyboard-inset');
  }
}

function clearOwner(owner){
  if(!owner)return;
  clearKeyboardState(owner);
  for(const node of nodesFor(owner)){
    node.style?.removeProperty?.('--shell-form-vv-top');
    node.style?.removeProperty?.('--shell-form-vv-height');
  }
}

function readViewport(){
  const visualTop=Math.max(0,Math.round(vv?.offsetTop||0));
  const visualHeight=Math.max(1,Math.round(vv?.height||window.innerHeight||1));
  const visualBottom=visualTop+visualHeight;

  const rawDrop=Math.max(0,restingVisualHeight-visualHeight);
  if(!activeField||rawDrop<KEYBOARD_THRESHOLD_PX){
    restingVisualHeight=Math.max(restingVisualHeight,visualHeight);
  }

  const heightDrop=Math.max(0,restingVisualHeight-visualHeight);
  return{
    visualTop,
    visualHeight,
    visualBottom,
    occlusion:heightDrop,
    keyboardOpen:Boolean(
      vv &&
      mobileRuntime() &&
      activeField &&
      heightDrop>=KEYBOARD_THRESHOLD_PX
    )
  };
}

function publishViewport(owner,state){
  if(!owner||!state)return;
  for(const node of nodesFor(owner)){
    node.style.setProperty('--shell-form-vv-top',`${state.visualTop}px`);
    node.style.setProperty('--shell-form-vv-height',`${state.visualHeight}px`);
  }
}

function actionFor(owner){
  if(owner?.kind==='profile')return owner.surface.querySelector?.('.shell-profile-save')||null;
  if(owner?.kind==='auth')return owner.surface.querySelector?.('.guest-auth-primary')||null;
  return null;
}

function revealWithinOwner(owner,field,state){
  if(!owner?.surface||!field?.getBoundingClientRect||!state)return false;

  const surface=owner.surface;
  const surfaceRect=surface.getBoundingClientRect();
  const fieldRect=field.getBoundingClientRect();
  if(!surfaceRect||!fieldRect)return false;

  const visibleTop=Math.max(surfaceRect.top+EDGE_PX,state.visualTop+EDGE_PX);
  const visibleBottom=Math.min(surfaceRect.bottom-EDGE_PX,state.visualBottom-EDGE_PX);
  if(visibleBottom<=visibleTop)return false;

  let revealTop=fieldRect.top;
  let revealBottom=fieldRect.bottom;

  const action=actionFor(owner);
  const actionRect=action?.getBoundingClientRect?.()||null;
  if(actionRect){
    const clusterTop=Math.min(revealTop,actionRect.top);
    const clusterBottom=Math.max(revealBottom,actionRect.bottom);
    const available=Math.max(1,visibleBottom-visibleTop);
    if(clusterBottom-clusterTop<=available){
      revealTop=clusterTop;
      revealBottom=clusterBottom;
    }
  }

  let delta=0;
  if(revealBottom>visibleBottom)delta=revealBottom-visibleBottom;
  else if(revealTop<visibleTop)delta=revealTop-visibleTop;
  if(!delta)return false;

  surface.scrollTop=Math.max(0,Number(surface.scrollTop||0)+delta);
  return true;
}

function publish(){
  frame=0;
  const nextOwner=ownerFor(activeField);

  if(activeOwner&&!sameOwner(activeOwner,nextOwner))clearOwner(activeOwner);
  activeOwner=nextOwner;
  if(!activeOwner)return false;

  const state=readViewport();
  publishViewport(activeOwner,state);

  if(!state.keyboardOpen){
    clearKeyboardState(activeOwner);
    return false;
  }

  activeOwner.host.dataset.mobileKeyboard='true';
  activeOwner.surface.dataset.mobileKeyboard='true';
  activeOwner.surface.style.setProperty(
    '--shell-form-keyboard-inset',
    `${Math.max(0,Math.round(state.occlusion))}px`
  );

  requestAnimationFrame(()=>{
    if(!activeOwner||!activeField)return;
    revealWithinOwner(activeOwner,activeField,state);
  });
  return true;
}

function schedule(){
  if(frame)return;
  frame=requestAnimationFrame(publish);
}

function onFocusIn(event){
  const owner=ownerFor(event.target);
  if(!owner)return;
  activeField=event.target;
  schedule();
}

function onFocusOut(){
  requestAnimationFrame(()=>{
    const next=document.activeElement;
    const owner=ownerFor(next);
    if(owner){
      activeField=next;
      schedule();
      return;
    }
    activeField=null;
    clearOwner(activeOwner);
    activeOwner=null;
  });
}

function refresh(){
  const next=document.activeElement;
  activeField=ownerFor(next)?next:null;
  schedule();
}

document.addEventListener('focusin',onFocusIn,true);
document.addEventListener('focusout',onFocusOut,true);
vv?.addEventListener('resize',schedule,{passive:true});
vv?.addEventListener('scroll',schedule,{passive:true});
window.addEventListener('orientationchange',()=>{
  restingVisualHeight=Math.max(1,Math.round(vv?.height||window.innerHeight||1));
  schedule();
},{passive:true});

window.V21ShellFormViewportPolicy=Object.freeze({
  version:RELEASE_VERSION,
  moduleContractVersion:MODULE_CONTRACT_VERSION,
  refresh,
  snapshot:()=>({
    active:Boolean(activeOwner),
    kind:activeOwner?.kind||null,
    keyboardOpen:Boolean(activeOwner?.host?.dataset?.mobileKeyboard==='true'),
    restingVisualHeight
  })
});
})();
