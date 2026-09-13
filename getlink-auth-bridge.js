(()=>{
'use strict';

const GETLINK_ORIGIN='https://get.taphoa.xyz';
let syncSeq=0;
let latestWorkContext=null;

function frame(){return document.getElementById('workGetlinkFrame')}
function authStore(){return window.V21AuthSessionStore||null}
function clean(value){return String(value??'').trim()}
function normalizeWorkContext(detail){
  const contactId=clean(detail?.contactId);
  if(!contactId)return null;
  const sourceMessageIds=Array.from(new Set(
    (Array.isArray(detail?.sourceMessageIds)?detail.sourceMessageIds:[])
      .map(clean).filter(Boolean)
  )).slice(0,100);
  return{
    contactId,
    customerName:clean(detail?.customerName),
    sourceMessageIds,
    preset:clean(detail?.preset)||'today',
    from:clean(detail?.from),
    to:clean(detail?.to),
  };
}

async function currentAccessToken(){
  const store=authStore();
  const snapshot=store?.snapshot?.()||{};
  if(snapshot.state!=='AUTHENTICATED')return null;
  try{
    const result=await store.getClient()?.auth?.getSession?.();
    return result?.data?.session?.access_token||null;
  }catch{return null;}
}

function postWorkContext(target=frame()){
  if(!target?.contentWindow||!latestWorkContext)return false;
  target.contentWindow.postMessage({type:'taphoa-chat-work-context',...latestWorkContext},GETLINK_ORIGIN);
  return true;
}

async function syncGetlinkAuthBridge(){
  const seq=++syncSeq;
  const target=frame();
  if(!target?.contentWindow)return false;
  const accessToken=await currentAccessToken();
  if(seq!==syncSeq)return false;
  target.contentWindow.postMessage({type:'taphoa-chat-auth',accessToken},GETLINK_ORIGIN);
  postWorkContext(target);
  return true;
}

function bindFrame(){
  const target=frame();
  if(!target||target.dataset.chatAuthBridgeBound==='true')return false;
  target.dataset.chatAuthBridgeBound='true';
  target.addEventListener('load',()=>{void syncGetlinkAuthBridge();});
  return true;
}

async function markWorkContextImported(message){
  const contactId=clean(message?.contactId);
  if(!contactId||!latestWorkContext||String(latestWorkContext.contactId)!==contactId)return false;
  const callbackIds=Array.from(new Set(
    (Array.isArray(message?.sourceMessageIds)?message.sourceMessageIds:[])
      .map(clean).filter(Boolean)
  ));
  const allowed=new Set(latestWorkContext.sourceMessageIds||[]);
  const sourceMessageIds=(callbackIds.length?callbackIds:[...allowed]).filter(id=>allowed.has(id));
  if(!sourceMessageIds.length)return false;
  const source=window.V21AdminOrderSource;
  if(!source?.markImported)return false;
  try{
    return await source.markImported({
      contactId,
      messageIds:sourceMessageIds,
      externalOrderId:clean(message?.orderId),
      externalOrderNo:clean(message?.orderNo),
    });
  }catch(error){
    console.warn('[work-context-imported]',String(error?.message||error||'failed'));
    return false;
  }
}

document.addEventListener('v21-auth-state',()=>{void syncGetlinkAuthBridge();});
document.addEventListener('v21-auth-token-refreshed',()=>{void syncGetlinkAuthBridge();});
document.addEventListener('navigation-change',event=>{
  if(event?.detail?.route==='work')void syncGetlinkAuthBridge();
});
document.addEventListener('v21-work-context',event=>{
  const next=normalizeWorkContext(event?.detail);
  if(!next)return;
  latestWorkContext=next;
  postWorkContext();
});
window.addEventListener('message',event=>{
  if(event.origin!==GETLINK_ORIGIN)return;
  if(event.data?.type==='taphoa-getlink-auth-request'){
    void syncGetlinkAuthBridge();
    return;
  }
  if(event.data?.type==='taphoa-work-order-created'){
    void markWorkContextImported(event.data);
  }
});

bindFrame();
void syncGetlinkAuthBridge();
window.V21GetlinkAuthBridge=Object.freeze({
  sync:syncGetlinkAuthBridge,
  postWorkContext,
  snapshot(){return latestWorkContext?{...latestWorkContext,sourceMessageIds:[...latestWorkContext.sourceMessageIds]}:null;},
});
})();
