(()=>{
'use strict';

const GETLINK_ORIGIN='https://get.taphoa.xyz';
let syncSeq=0;

function frame(){return document.getElementById('workGetlinkFrame')}
function authStore(){return window.V21AuthSessionStore||null}

async function payload(){
  const store=authStore();
  const snapshot=store?.snapshot?.()||{};
  if(snapshot.state!=='AUTHENTICATED'||!snapshot.account){
    return{type:'taphoa-chat-auth',accessToken:null,account:null};
  }
  let accessToken=null;
  try{
    const result=await store.getClient()?.auth?.getSession?.();
    accessToken=result?.data?.session?.access_token||null;
  }catch{}
  const account=snapshot.account;
  return{
    type:'taphoa-chat-auth',
    accessToken:accessToken||null,
    account:account?{...account}:null
  };
}

async function syncGetlinkAuthBridge(){
  const seq=++syncSeq;
  const target=frame();
  if(!target?.contentWindow)return false;
  const message=await payload();
  if(seq!==syncSeq)return false;
  target.contentWindow.postMessage(message,GETLINK_ORIGIN);
  return true;
}

function bindFrame(){
  const target=frame();
  if(!target||target.dataset.chatAuthBridgeBound==='true')return;
  target.dataset.chatAuthBridgeBound='true';
  target.addEventListener('load',()=>{void syncGetlinkAuthBridge();});
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
window.V21GetlinkAuthBridge={sync:syncGetlinkAuthBridge};
})();
