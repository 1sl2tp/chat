(()=>{
'use strict';

const RELEASE_VERSION='V21.72.16';
const MODULE_CONTRACT_VERSION='app-update-v1';
const CHECK_INTERVAL_MS=45000;
const DEFER_RECHECK_MS=2500;
const RELOAD_GUARD_MS=20000;
const VERSION_URL='./version.json';
const currentVersion=String(
  document.querySelector('meta[name="app-release-version"]')?.content||RELEASE_VERSION
);
let registration=null;
let pendingVersion='';
let checkPromise=null;
let deferredTimer=0;

function emit(reason,detail={}){
  try{
    document.dispatchEvent(new CustomEvent('v21-app-update',{
      detail:{reason:String(reason||'change'),currentVersion,pendingVersion,...detail}
    }));
  }catch{}
}
function hasDraft(){
  const editor=document.getElementById('editor');
  if(String(editor?.value||'').length)return true;
  const tray=document.getElementById('attachmentTray');
  if(Number(tray?.childElementCount||0)>0)return true;
  const reply=document.getElementById('replyContext');
  if(reply&&!reply.hidden)return true;
  return false;
}
function safeToReload(){
  if(document.visibilityState&&document.visibilityState!=='visible')return false;
  const interaction=window.V21InteractionController?.snapshot?.()||null;
  if(interaction&&String(interaction.mode||'NONE')!=='NONE')return false;
  const capture=window.V21AudioCapturePolicy?.active?.()||null;
  if(capture&&String(capture.mode||'idle')!=='idle')return false;
  const sync=window.V21SyncEngine?.snapshot?.()||null;
  if(sync&&(sync.syncing||sync.wakePending))return false;
  if(hasDraft())return false;
  return true;
}
function guardKey(version){return 'taphoa.v21.reload.'+String(version||'unknown');}
function recentlyReloaded(version){
  try{
    const value=Number(sessionStorage.getItem(guardKey(version))||0);
    return value>0&&Date.now()-value<RELOAD_GUARD_MS;
  }catch{return false;}
}
function rememberReload(version){
  try{sessionStorage.setItem(guardKey(version),String(Date.now()));}catch{}
}
function scheduleDeferred(){
  if(deferredTimer)return;
  deferredTimer=setTimeout(()=>{
    deferredTimer=0;
    maybeReload();
  },DEFER_RECHECK_MS);
}
function maybeReload(){
  if(!pendingVersion)return false;
  document.documentElement.dataset.appUpdatePending=pendingVersion;
  if(!safeToReload()){
    emit('reload-deferred');
    scheduleDeferred();
    return false;
  }
  if(recentlyReloaded(pendingVersion)){
    emit('reload-guarded');
    scheduleDeferred();
    return false;
  }
  rememberReload(pendingVersion);
  emit('reloading');
  location.reload();
  return true;
}
async function activateWaitingWorker(){
  try{
    if(registration?.waiting){
      registration.waiting.postMessage({type:'SKIP_WAITING'});
      return true;
    }
  }catch{}
  return false;
}
async function checkForUpdate({reason='interval'}={}){
  if(checkPromise)return checkPromise;
  checkPromise=(async()=>{
    try{
      try{await registration?.update?.();}catch{}
      const response=await fetch(
        VERSION_URL+'?t='+Date.now(),
        {cache:'no-store',credentials:'same-origin'}
      );
      if(!response.ok)return false;
      const remote=await response.json();
      const next=String(remote?.version||'');
      if(!next||next===currentVersion)return false;
      pendingVersion=next;
      emit('update-found',{trigger:String(reason||'check'),remote});
      await activateWaitingWorker();
      maybeReload();
      return true;
    }catch(error){
      emit('check-failed',{message:String(error?.message||error||'update_check_failed')});
      return false;
    }finally{
      checkPromise=null;
    }
  })();
  return checkPromise;
}
async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return null;
  if(location.protocol!=='https:'&&location.hostname!=='localhost')return null;
  try{
    registration=await navigator.serviceWorker.register('./sw.js',{
      scope:'./',
      updateViaCache:'none'
    });
    registration.addEventListener?.('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener?.('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller){
          void activateWaitingWorker();
          if(pendingVersion)maybeReload();
        }
      });
    });
    await registration.update().catch(()=>{});
    return registration;
  }catch(error){
    emit('service-worker-failed',{message:String(error?.message||error||'service_worker_failed')});
    return null;
  }
}
function bind(){
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void checkForUpdate({reason:'visible'});
  });
  window.addEventListener('focus',()=>void checkForUpdate({reason:'focus'}));
  window.addEventListener('online',()=>void checkForUpdate({reason:'online'}));
  document.addEventListener('v21-interaction-mode',()=>maybeReload());
  document.addEventListener('input',()=>maybeReload(),true);
  navigator.serviceWorker?.addEventListener?.('controllerchange',()=>maybeReload());
  setInterval(()=>void checkForUpdate({reason:'interval'}),CHECK_INTERVAL_MS);
}
async function boot(){
  bind();
  await registerServiceWorker();
  void checkForUpdate({reason:'boot'});
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});
}else{
  void boot();
}

window.V21AppUpdateController=Object.freeze({
  version:RELEASE_VERSION,
  moduleContractVersion:MODULE_CONTRACT_VERSION,
  currentVersion,
  check:checkForUpdate,
  safeToReload,
  snapshot:()=>({currentVersion,pendingVersion,serviceWorker:Boolean(registration)})
});
})();
