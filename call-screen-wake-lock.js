(()=>{
'use strict';

const RELEASE_VERSION='V21.72.24';
const MODULE_CONTRACT_VERSION='call-screen-wake-lock-v1';

let callActive=false;
let sentinel=null;
let requestPromise=null;
let generation=0;

function supported(){
  return Boolean(navigator?.wakeLock&&typeof navigator.wakeLock.request==='function');
}

function visible(){
  return document.visibilityState!=='hidden';
}

function shouldHold(){
  return callActive&&visible();
}

async function release(reason='release'){
  generation+=1;
  const current=sentinel;
  sentinel=null;
  if(current&&!current.released){
    try{await current.release();}catch{}
  }
  return true;
}

async function acquire(reason='acquire'){
  if(!shouldHold()||!supported())return false;
  if(sentinel&&!sentinel.released)return true;
  if(requestPromise)return requestPromise;

  const token=generation;
  requestPromise=(async()=>{
    try{
      const lock=await navigator.wakeLock.request('screen');
      if(token!==generation||!shouldHold()){
        try{if(!lock.released)await lock.release();}catch{}
        return false;
      }
      sentinel=lock;
      lock.addEventListener?.('release',()=>{
        if(sentinel===lock)sentinel=null;
      },{once:true});
      return true;
    }catch{
      return false;
    }finally{
      requestPromise=null;
    }
  })();
  return requestPromise;
}

function sync(reason='sync'){
  return shouldHold()?acquire(reason):release(reason);
}

function setCallState(state){
  callActive=String(state||'')==='ACTIVE_AUDIO';
  void sync('call-state');
  return callActive;
}

document.addEventListener('call-state',event=>{
  setCallState(event.detail?.state);
});

document.addEventListener('visibilitychange',()=>{
  void sync('visibilitychange');
});

document.addEventListener('v21-auth-state',event=>{
  if(event.detail?.state==='AUTHENTICATED')return;
  callActive=false;
  void release('auth-reset');
});

window.addEventListener('pagehide',()=>{
  callActive=false;
  void release('pagehide');
});

window.V21CallScreenWakeLock=Object.freeze({
  version:RELEASE_VERSION,
  contract:MODULE_CONTRACT_VERSION,
  supported,
  snapshot(){
    return{
      callActive,
      held:Boolean(sentinel&&!sentinel.released),
      pending:Boolean(requestPromise),
      visible:visible()
    };
  }
});
})();
