(()=>{
'use strict';

const GETLINK_ORIGIN='https://get.taphoa.xyz';
const MESSAGE_TYPE='taphoa-auth-context';
let sendSeq=0;

function workFrame(){
  return document.getElementById('workGetlinkFrame');
}

function publicAccount(value){
  if(!value||typeof value!=='object')return null;
  const role=value.role==='admin'?'admin':'user';
  return {
    id:String(value.id||''),
    username:String(value.username||''),
    display_name:String(value.display_name||''),
    role,
    avatar_url:String(value.avatar_url||''),
    avatar_path:String(value.avatar_path||'')
  };
}

async function currentAuthPayload(accessTokenHint=''){
  const store=window.V21AuthSessionStore;
  const snapshot=store?.snapshot?.()||{};
  let accessToken=String(accessTokenHint||'');

  if(!accessToken&&store?.getClient){
    try{
      const client=store.getClient();
      const {data}=await client.auth.getSession();
      accessToken=String(data?.session?.access_token||'');
    }catch{}
  }

  const account=publicAccount(snapshot.account);
  const authenticated=snapshot.state==='AUTHENTICATED'&&Boolean(account?.id)&&Boolean(accessToken);
  return {
    type:MESSAGE_TYPE,
    authenticated,
    account:authenticated?account:null,
    accessToken:authenticated?accessToken:''
  };
}

async function postCurrentAuth(accessTokenHint=''){
  const frame=workFrame();
  if(!frame?.contentWindow)return false;
  const seq=++sendSeq;
  const payload=await currentAuthPayload(accessTokenHint);
  if(seq!==sendSeq)return false;
  frame.contentWindow.postMessage(payload,GETLINK_ORIGIN);
  return true;
}

function queueAuthPost(accessTokenHint=''){
  queueMicrotask(()=>{void postCurrentAuth(accessTokenHint);});
}

function bind(){
  const frame=workFrame();
  if(frame&&!frame.dataset.workAuthBridgeBound){
    frame.dataset.workAuthBridgeBound='1';
    frame.addEventListener("load",()=>queueAuthPost());
  }

  document.addEventListener('v21-auth-state',()=>queueAuthPost());
  document.addEventListener('v21-auth-token-refreshed',event=>{
    queueAuthPost(String(event?.detail?.accessToken||''));
  });
  document.addEventListener('v21-account-profile-updated',()=>queueAuthPost());

  // The iframe can be present before auth bootstrap finishes. Sending once now
  // establishes guest/self state; later auth events replace it with the session.
  queueAuthPost();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();

window.V21WorkAuthBridge={
  version:'work-auth-bridge-v1',
  targetOrigin:GETLINK_ORIGIN,
  postCurrentAuth
};
})();
