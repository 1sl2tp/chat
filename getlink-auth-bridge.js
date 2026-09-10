(()=>{
'use strict';

const GETLINK_ORIGIN='https://get.taphoa.xyz';
let syncSeq=0;

function frame(){return document.getElementById('workGetlinkFrame')}
function authStore(){return window.V21AuthSessionStore||null}

async function currentAccessToken(){
  const store=authStore();
  const snapshot=store?.snapshot?.()||{};
  if(snapshot.state!=='AUTHENTICATED')return null;
  try{
    const result=await store.getClient()?.auth?.getSession?.();
    return result?.data?.session?.access_token||null;
  }catch{return null;}
}

async function syncGetlinkAuthBridge(){
  const seq=++syncSeq;
  const target=frame();
  if(!target?.contentWindow)return false;
  const accessToken=await currentAccessToken();
  if(seq!==syncSeq)return false;
  target.contentWindow.postMessage({type:'taphoa-chat-auth',accessToken},GETLINK_ORIGIN);
  return true;
}

function bindFrame(){
  const target=frame();
  if(!target||target.dataset.chatAuthBridgeBound==='true')return false;
  target.dataset.chatAuthBridgeBound='true';
  target.addEventListener('load',()=>{void syncGetlinkAuthBridge();});
  return true;
}

document.addEventListener('v21-auth-state',()=>{void syncGetlinkAuthBridge();});
document.addEventListener('v21-auth-token-refreshed',()=>{void syncGetlinkAuthBridge();});
document.addEventListener('navigation-change',event=>{
  if(event?.detail?.route==='work')void syncGetlinkAuthBridge();
});
window.addEventListener('message',event=>{
  if(event.origin!==GETLINK_ORIGIN)return;
  if(event.data?.type==='taphoa-getlink-auth-request')void syncGetlinkAuthBridge();
});

bindFrame();
void syncGetlinkAuthBridge();
window.V21GetlinkAuthBridge=Object.freeze({sync:syncGetlinkAuthBridge});
})();
