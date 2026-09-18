(()=>{
'use strict';

const InteractionMode=Object.freeze({
  NONE:'NONE',
  IMAGE_VIEWER:'IMAGE_VIEWER',
  PROFILE_MODAL:'PROFILE_MODAL',
  ACCOUNT_SETTINGS:'ACCOUNT_SETTINGS',
  MESSAGE_FORWARD:'MESSAGE_FORWARD',
  DUPLICATE_WARNING:'DUPLICATE_WARNING',
  AUDIO_RECORDING:'AUDIO_RECORDING',
  VIDEO_RECORDING:'VIDEO_RECORDING',
  CALL_RINGING:'CALL_RINGING',
  CALL_CONNECTING:'CALL_CONNECTING',
  AUDIO_CALL:'AUDIO_CALL',
  VIDEO_CALL:'VIDEO_CALL'
});

let mode=InteractionMode.NONE;
let owner='';
let generation=0;
let locksBaseUi=false;
let priorBaseUiState=null;

function screenHost(){return document.getElementById('screenHost');}

function snapshot(){
  return{mode,owner,generation,locksBaseUi};
}

function publish(reason){
  document.dispatchEvent(new CustomEvent('v21-interaction-mode',{
    detail:{...snapshot(),reason:String(reason||'change')}
  }));
}

function setBaseUiLocked(locked){
  const host=screenHost();
  if(!host)return;
  if(locked){
    if(priorBaseUiState)return;
    priorBaseUiState={
      inert:host.hasAttribute('inert'),
      ariaHidden:host.getAttribute('aria-hidden')
    };
    host.setAttribute('inert','');
    host.setAttribute('aria-hidden','true');
    host.dataset.interactionLocked='true';
    return;
  }
  if(!priorBaseUiState){
    delete host.dataset.interactionLocked;
    return;
  }
  if(!priorBaseUiState.inert)host.removeAttribute('inert');
  if(priorBaseUiState.ariaHidden===null)host.removeAttribute('aria-hidden');
  else host.setAttribute('aria-hidden',priorBaseUiState.ariaHidden);
  delete host.dataset.interactionLocked;
  priorBaseUiState=null;
}

function canEnter(next){
  const target=String(next||'');
  if(!target||target===InteractionMode.NONE)return false;
  return mode===InteractionMode.NONE||mode===target;
}

function enter(next,{owner:nextOwner='',lockBaseUi=false}={}){
  const target=String(next||'');
  const nextOwnerValue=String(nextOwner||target||'interaction');
  if(!canEnter(target))return null;
  if(mode===target){
    if(owner&&nextOwnerValue&&owner!==nextOwnerValue)return null;
    return snapshot();
  }
  mode=target;
  owner=nextOwnerValue;
  locksBaseUi=Boolean(lockBaseUi);
  generation+=1;
  if(locksBaseUi)setBaseUiLocked(true);
  publish('enter');
  return snapshot();
}

function transition(expected,next,{owner:expectedOwner='',lockBaseUi:nextLockBaseUi=locksBaseUi}={}){
  const expectedMode=String(expected||'');
  const target=String(next||'');
  if(mode!==expectedMode||!target||target===InteractionMode.NONE)return null;
  if(expectedOwner&&owner!==String(expectedOwner))return null;
  if(locksBaseUi&&!nextLockBaseUi)setBaseUiLocked(false);
  if(!locksBaseUi&&nextLockBaseUi)setBaseUiLocked(true);
  mode=target;
  locksBaseUi=Boolean(nextLockBaseUi);
  generation+=1;
  publish('transition');
  return snapshot();
}

function exit(expected,{owner:expectedOwner=''}={}){
  const expectedMode=String(expected||'');
  if(mode===InteractionMode.NONE)return false;
  if(expectedMode&&mode!==expectedMode)return false;
  if(expectedOwner&&owner!==String(expectedOwner))return false;
  if(locksBaseUi)setBaseUiLocked(false);
  mode=InteractionMode.NONE;
  owner='';
  locksBaseUi=false;
  generation+=1;
  publish('exit');
  return true;
}

function isLeaseCurrent(lease){
  return Boolean(
    lease &&
    lease.mode===mode &&
    lease.owner===owner &&
    Number(lease.generation)===generation
  );
}

function forceReset(reason='global-abort'){
  const previous=snapshot();
  document.dispatchEvent(new CustomEvent('v21-interaction-abort',{
    detail:{reason:String(reason||'global-abort'),previous}
  }));
  if(locksBaseUi)setBaseUiLocked(false);
  mode=InteractionMode.NONE;
  owner='';
  locksBaseUi=false;
  generation+=1;
  publish(reason);
  return previous;
}

const InteractionController=Object.freeze({
  snapshot,
  canEnter,
  enter,
  transition,
  exit,
  isLeaseCurrent,
  forceReset
});

window.V21InteractionMode=InteractionMode;
window.V21InteractionController=InteractionController;
})();
