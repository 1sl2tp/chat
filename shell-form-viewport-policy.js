(()=>{
'use strict';

const RELEASE_VERSION='V21.72.39';
const MODULE_CONTRACT_VERSION='shell-form-viewport-v3';
const KEYBOARD_THRESHOLD_PX=80;
const EDGE_PX=12;

/* SPEC-CHAT-PWA-VIEWPORT-ZOOM-20261102 · P0 platform owner.
   Installed PWA shell keeps its scale while scroll, native text selection and
   Composer focus remain owned by their existing controls. The image viewer
   mounts in #globalOverlayRoot OUTSIDE #appShell; its own pinch zoom survives.
   Ordinary Safari/Chrome tabs keep their native accessibility zoom. */
function standaloneShellRuntime(){
  return navigator.standalone===true ||
    Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches);
}
function preventStandaloneShellPinch(event){
  if(!event.cancelable)return;
  const shell=document.getElementById('appShell');
  if(shell?.contains(event.target))event.preventDefault();
}
if(standaloneShellRuntime()){
  if(document.documentElement?.dataset)document.documentElement.dataset.chatStandalone='true';
  // Only installed app mode requests a fixed native page scale. In normal
  // Safari/Chrome tabs users retain browser zoom for accessibility.
  const viewport=document.querySelector?.('meta[name="viewport"]');
  if(viewport)viewport.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
  for(const eventType of ['gesturestart','gesturechange']){
    document.addEventListener(eventType,preventStandaloneShellPinch,{
      capture:true,passive:false
    });
  }
}

const vv=window.visualViewport||null;
let restingVisualHeight=Math.max(1,Math.round(vv?.height||window.innerHeight||1));
let activeField=null;
let activeOwner=null;
let frame=0;
let lastReveal=null;

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

  // SPEC-CHAT-SETTINGS-IOS-KEYBOARD-20261101:
  // Settings and nested account picker use the existing platform
  // VisualViewport owner rather than ad-hoc feature resize listeners.
  const accountPanel=node.closest?.('.zalo-account-submodal > .zalo-account-panel')||null;
  if(accountPanel){
    const host=accountPanel.closest?.('.zalo-account-submodal')||null;
    if(host)return{kind:'account-settings-panel',surface:accountPanel,host};
  }
  const accountCard=node.closest?.('.zalo-account-card')||null;
  if(accountCard){
    const host=accountCard.closest?.('.zalo-account-modal')||null;
    if(host)return{kind:'account-settings',surface:accountCard,host};
  }

  // SPEC-CHAT-MOBILE-SEARCH-KEYBOARD-20261101: the Directory is a
  // fixed-height scroll shell; its contact search cannot inherit a
  // layout viewport height after the iOS software keyboard opens.
  const directorySearch=node.closest?.('.contact-directory-tools')||null;
  if(directorySearch){
    const host=directorySearch.closest?.('#shellNavigationLayer')||null;
    const panel=directorySearch.closest?.('.shell-navigation-panel')||null;
    if(host&&panel)return{kind:'directory',surface:panel,host};
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
  if(lastReveal&&sameOwner(lastReveal.owner,owner))lastReveal=null;
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
    const top=`${state.visualTop}px`;
    const height=`${state.visualHeight}px`;
    // Repeated iOS viewport events must not invalidate identical layouts.
    if(node.style.getPropertyValue('--shell-form-vv-top')!==top)
      node.style.setProperty('--shell-form-vv-top',top);
    if(node.style.getPropertyValue('--shell-form-vv-height')!==height)
      node.style.setProperty('--shell-form-vv-height',height);
  }
}

function actionFor(owner){
  if(owner?.kind==='profile')return owner.surface.querySelector?.('.shell-profile-save')||null;
  if(owner?.kind==='auth')return owner.surface.querySelector?.('.guest-auth-primary')||null;
  return null;
}

// One bounded scroll owner; never keep pushing beyond the available list.
function scrollPane(pane,delta){
  if(!pane)return false;
  const current=Math.max(0,Number(pane.scrollTop)||0);
  let next=Math.max(0,Math.round(current+delta));
  const extent=Number(pane.scrollHeight);
  const viewport=Number(pane.clientHeight);
  if(Number.isFinite(extent)&&Number.isFinite(viewport)&&extent>0&&viewport>0)
    next=Math.min(next,Math.max(0,extent-viewport));
  if(Math.abs(next-current)<2)return false;
  pane.scrollTop=next;
  return true;
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

  // Settings content is split into scrollable preferences/directory/picker.
  // Scrolling the outer clipped card does not reveal a field in those panes.
  // Account search is a pinned sibling above the list, not a child of
  // the scrolling list. The keyboard CSS collapses the preferences while
  // that search is focused. Trying to scroll the clipped outer card did
  // nothing and could leave the search beneath the keyboard.
  if(owner.kind==='account-settings'){
    if(field.closest?.('.zalo-account-search'))return false;
    const pane=field.closest?.('.zalo-account-preferences,.zalo-account-list');
    if(!pane)return false;
    return scrollPane(pane,delta);
  }
  if(owner.kind==='account-settings-panel'){
    return scrollPane(surface,delta);
  }
  if(owner.kind==='directory')return false;
  return scrollPane(surface,delta);
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
    // SPEC-CHAT-KEYBOARD-REOPEN-20261102: the reveal checkpoint is valid
    // only for ONE keyboard-open session. If the same field remains focused
    // when the keyboard closes, reopening at identical viewport geometry
    // must re-reveal it instead of incorrectly skipping the scroll.
    lastReveal=null;
    clearKeyboardState(activeOwner);
    return false;
  }

  activeOwner.host.dataset.mobileKeyboard='true';
  activeOwner.surface.dataset.mobileKeyboard='true';
  activeOwner.surface.style.setProperty(
    '--shell-form-keyboard-inset',
    `${Math.max(0,Math.round(state.occlusion))}px`
  );

  const revealOwner=activeOwner;
  const revealField=activeField;
  // SPEC-CHAT-KEYBOARD-SCROLL-STABILITY-20261101:
  // Repeated viewport scroll events while the caret/list is stable are not
  // permission to scroll the list back to the focused item.
  const prior=lastReveal;
  const needsReveal=!prior||!sameOwner(prior.owner,revealOwner)||
    prior.field!==revealField||prior.top!==state.visualTop||
    prior.height!==state.visualHeight;
  if(needsReveal){
    // SPEC-CHAT-STALE-KEYBOARD-REVEAL-20261102
    // An older animation frame must not scroll a panel after iOS has
    // dismissed/resized the keyboard, even before the next publish runs.
    const checkpoint={owner:revealOwner,field:revealField,
      top:state.visualTop,height:state.visualHeight};
    lastReveal=checkpoint;
    requestAnimationFrame(()=>{
      if(lastReveal!==checkpoint||
         !sameOwner(revealOwner,activeOwner)||activeField!==revealField)return;
      const current=readViewport();
      if(!current.keyboardOpen||current.visualTop!==state.visualTop||
         current.visualHeight!==state.visualHeight)return;
      revealWithinOwner(revealOwner,revealField,state);
    });
  }
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
