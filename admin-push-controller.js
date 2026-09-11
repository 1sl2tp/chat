(()=>{
'use strict';

const VERSION='V21.73.3-admin-push-v1';
let state={admin:false,supported:false,code:'idle',enabled:false,permission:'default',platform:'web'};

function authStore(){return window.V21AuthSessionStore||null;}
function authSnapshot(){return authStore()?.snapshot?.()||{};}
function isAdmin(){
  const snap=authSnapshot();
  return snap.state==='AUTHENTICATED'&&snap.account?.role==='admin';
}
function isStandalone(){
  try{return Boolean(navigator.standalone||window.matchMedia?.('(display-mode: standalone)')?.matches);}catch{return false;}
}
function platform(){
  const ua=String(navigator.userAgent||'');
  if(/iPhone|iPad|iPod/i.test(ua))return isStandalone()?'ios-pwa':'ios-web';
  if(/Android/i.test(ua))return isStandalone()?'android-pwa':'android-web';
  return isStandalone()?'pwa':'web';
}
function browserSupported(){
  return typeof Notification!=='undefined'&&Boolean(navigator.serviceWorker);
}
function result(next={}){
  state={...state,...next};
  return Object.freeze({...state});
}
function urlBase64ToUint8Array(value){
  const raw=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=raw+'='.repeat((4-(raw.length%4))%4);
  const binary=atob(padded);
  const bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  return bytes;
}
async function invoke(action,extra={}){
  const client=authStore()?.getClient?.();
  if(!client?.functions?.invoke)throw new Error('push_client_unavailable');
  const {data,error}=await client.functions.invoke('v21-admin-push',{body:{action,...extra}});
  if(error)throw error;
  if(!data?.ok)throw new Error(String(data?.code||'push_request_failed'));
  return data;
}
async function registration(){
  if(!navigator.serviceWorker?.ready)throw new Error('service_worker_unavailable');
  const ready=await navigator.serviceWorker.ready;
  if(!ready?.pushManager)throw new Error('push_unsupported');
  return ready;
}
async function localSubscription(){
  try{return await (await registration()).pushManager.getSubscription();}catch{return null;}
}
function subscriptionJSON(subscription){
  const json=subscription?.toJSON?.()||{};
  return {
    endpoint:String(json.endpoint||subscription?.endpoint||''),
    keys:{
      p256dh:String(json.keys?.p256dh||''),
      auth:String(json.keys?.auth||''),
    }
  };
}

async function status(){
  const admin=isAdmin();
  const currentPlatform=platform();
  if(!admin)return result({ok:false,admin:false,supported:false,enabled:false,code:'admin_required',platform:currentPlatform});
  if(!browserSupported())return result({ok:true,admin:true,supported:false,enabled:false,code:'unsupported',platform:currentPlatform});
  if(currentPlatform==='ios-web')return result({ok:true,admin:true,supported:true,enabled:false,code:'ios_install_required',platform:currentPlatform,permission:String(Notification.permission||'default')});
  const permission=String(Notification.permission||'default');
  if(permission==='denied')return result({ok:true,admin:true,supported:true,enabled:false,code:'blocked',platform:currentPlatform,permission});
  const subscription=await localSubscription();
  if(!subscription)return result({ok:true,admin:true,supported:true,enabled:false,code:'disabled',platform:currentPlatform,permission});
  try{
    const data=await invoke('status',{endpoint:String(subscription.endpoint||'')});
    return result({ok:true,admin:true,supported:true,enabled:Boolean(data.enabled),code:data.enabled?'enabled':'disabled',platform:currentPlatform,permission});
  }catch{
    return result({ok:false,admin:true,supported:true,enabled:false,code:'status_error',platform:currentPlatform,permission});
  }
}

async function enable(){
  const currentPlatform=platform();
  if(!isAdmin())return result({ok:false,admin:false,supported:false,enabled:false,code:'admin_required',platform:currentPlatform});
  if(!browserSupported())return result({ok:false,admin:true,supported:false,enabled:false,code:'unsupported',platform:currentPlatform});
  if(currentPlatform==='ios-web')return result({ok:false,admin:true,supported:true,enabled:false,code:'ios_install_required',platform:currentPlatform});
  let permission=String(Notification.permission||'default');
  if(permission==='denied')return result({ok:false,admin:true,supported:true,enabled:false,code:'blocked',platform:currentPlatform,permission});
  if(permission!=='granted')permission=String(await Notification.requestPermission());
  if(permission!=='granted')return result({ok:false,admin:true,supported:true,enabled:false,code:permission==='denied'?'blocked':'disabled',platform:currentPlatform,permission});

  try{
    const reg=await registration();
    let subscription=await reg.pushManager.getSubscription();
    if(!subscription){
      const key=await invoke('public_key');
      subscription=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(key.public_key),
      });
    }
    const snap=authSnapshot();
    const normalized=subscriptionJSON(subscription);
    if(!normalized.endpoint||!normalized.keys.p256dh||!normalized.keys.auth)throw new Error('invalid_subscription');
    await invoke('subscribe',{
      subscription:normalized,
      device_id:snap.deviceId||null,
      platform:currentPlatform,
      user_agent:String(navigator.userAgent||''),
    });
    syncState();
    return result({ok:true,admin:true,supported:true,enabled:true,code:'enabled',platform:currentPlatform,permission});
  }catch(error){
    return result({ok:false,admin:true,supported:true,enabled:false,code:String(error?.message||'enable_failed'),platform:currentPlatform,permission});
  }
}

async function disable({bestEffort=false}={}){
  const currentPlatform=platform();
  const subscription=await localSubscription();
  let serverOk=true;
  if(subscription&&isAdmin()){
    try{await invoke('unsubscribe',{endpoint:String(subscription.endpoint||'')});}
    catch(error){serverOk=false;if(!bestEffort)return result({ok:false,admin:true,supported:browserSupported(),enabled:true,code:String(error?.message||'unsubscribe_failed'),platform:currentPlatform});}
  }
  if(subscription){
    try{await subscription.unsubscribe?.();}catch(error){if(!bestEffort)throw error;}
  }
  return result({ok:true,admin:isAdmin(),supported:browserSupported(),enabled:false,code:serverOk?'disabled':'disabled_local',platform:currentPlatform,permission:typeof Notification==='undefined'?'default':String(Notification.permission||'default')});
}

function syncState(){
  if(!isAdmin())return false;
  const shell=window.ChatAppShell?.snapshot?.()||{};
  const sync=window.V21SyncEngine?.snapshot?.()||{};
  const payload={
    type:'ADMIN_PUSH_STATE',
    visible:document.visibilityState==='visible',
    focused:typeof document.hasFocus==='function'?Boolean(document.hasFocus()):document.visibilityState==='visible',
    route:String(shell.route||'chat'),
    conversationId:String(sync.currentConversationId||''),
    contactId:String(shell.activeContact?.id||sync.currentContactId||''),
  };
  try{navigator.serviceWorker?.controller?.postMessage?.(payload);return true;}catch{return false;}
}

async function handleOpen(){return false;}
function snapshot(){return Object.freeze({...state});}

state={...state,admin:isAdmin(),supported:isAdmin()&&browserSupported(),permission:typeof Notification==='undefined'?'default':String(Notification.permission||'default'),platform:platform()};
window.V21AdminPush=Object.freeze({version:VERSION,status,enable,disable,syncState,handleOpen,snapshot});
})();
