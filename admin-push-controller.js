(()=>{
'use strict';

const VERSION='V21.73.4-admin-push-badge-v1';
const BASE_DOCUMENT_TITLE=String(document.title||'TAPHOA Chat').replace(/^\(\d+\)\s*/,'')||'TAPHOA Chat';
const faviconNode=document.querySelector?.('link[rel~="icon"]')||null;
const BASE_FAVICON_HREF=String(faviconNode?.getAttribute?.('href')||faviconNode?.href||'./icons/chat-192.png');
let state={admin:false,supported:false,code:'idle',enabled:false,permission:'default',platform:'web'};
let pendingOpen=null;
let unreadRefreshTimer=0;

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

function unreadFaviconHref(count){
  if(Math.max(0,Number(count)||0)===0)return BASE_FAVICON_HREF;
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="15" fill="#34c759"/><path d="M18 20h28v19H30l-8 7v-7h-4z" fill="white"/><circle cx="50" cy="14" r="10" fill="#ff3b30" stroke="white" stroke-width="3"/></svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

async function applyUnreadPresentation(count,{notifyWorker=true}={}){
  const normalized=Math.max(0,Number(count)||0);
  document.title=normalized>0?`(${normalized}) ${BASE_DOCUMENT_TITLE}`:BASE_DOCUMENT_TITLE;
  try{faviconNode?.setAttribute?.('href',unreadFaviconHref(normalized));}catch{}
  try{
    if(normalized>0&&typeof navigator?.setAppBadge==='function')await navigator.setAppBadge(normalized);
    else if(normalized===0&&typeof navigator?.clearAppBadge==='function')await navigator.clearAppBadge();
  }catch{}
  if(notifyWorker){
    try{navigator.serviceWorker?.controller?.postMessage?.({type:'ADMIN_PUSH_BADGE_SET',count:normalized});}catch{}
  }
  return normalized;
}

async function refreshUnreadBadge(){
  if(!isAdmin())return applyUnreadPresentation(0);
  let count=Math.max(0,Number(window.ChatAppShell?.UnreadIndicator?.snapshot?.()||0));
  try{
    const refresh=window.V21SyncEngine?.refreshUnread;
    if(typeof refresh==='function')count=Math.max(0,Number(await refresh())||0);
  }catch{}
  return applyUnreadPresentation(count);
}

function scheduleUnreadBadgeRefresh(delay=32){
  if(unreadRefreshTimer)clearTimeout(unreadRefreshTimer);
  unreadRefreshTimer=setTimeout(()=>{
    unreadRefreshTimer=0;
    void refreshUnreadBadge();
  },Math.max(0,Number(delay)||0));
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
    scheduleUnreadBadgeRefresh(0);
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

function clearClientState(){
  if(unreadRefreshTimer){clearTimeout(unreadRefreshTimer);unreadRefreshTimer=0;}
  void applyUnreadPresentation(0,{notifyWorker:false});
  try{
    navigator.serviceWorker?.controller?.postMessage?.({type:'ADMIN_PUSH_CLEAR'});
    return true;
  }catch{return false;}
}

function syncState(){
  if(!isAdmin()){clearClientState();return false;}
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

function coldOpenFromLocation(){
  try{
    const params=new URLSearchParams(String(location.search||''));
    const contactId=String(params.get('push_contact')||'').trim();
    const conversationId=String(params.get('push_conversation')||'').trim();
    if(!contactId&&!conversationId)return null;
    return{contactId,conversationId};
  }catch{return null;}
}

function clearColdOpenQuery(){
  try{
    const url=new URL(location.href);
    url.searchParams.delete('push_contact');
    url.searchParams.delete('push_conversation');
    const next=`${url.pathname}${url.search}${url.hash}`||'./';
    history.replaceState(history.state??null,'',next);
    return true;
  }catch{return false;}
}

async function handleOpen(payload={}){
  const contactId=String(payload?.contactId??payload?.contact_id??'').trim();
  const conversationId=String(payload?.conversationId??payload?.conversation_id??'').trim();
  if(!contactId&&!conversationId)return false;
  if(!isAdmin()||!contactId){pendingOpen={contactId,conversationId};return false;}
  const opened=Boolean(window.ChatAppShell?.NavigationCommand?.openContact?.(contactId));
  if(!opened){pendingOpen={contactId,conversationId};return false;}
  pendingOpen=null;
  clearColdOpenQuery();
  syncState();
  scheduleUnreadBadgeRefresh(0);
  return true;
}

async function consumePendingOpen(){
  if(!pendingOpen||!isAdmin())return false;
  return handleOpen({...pendingOpen});
}

function onAuthState(event){
  const detail=event?.detail||{};
  if(detail.state==='AUTHENTICATED'&&detail.account?.role==='admin'){
    void consumePendingOpen();
    syncState();
    scheduleUnreadBadgeRefresh(0);
    return;
  }
  clearClientState();
}

pendingOpen=coldOpenFromLocation();
navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='ADMIN_PUSH_OPEN')void handleOpen(event.data);
  if(event.data?.type==='ADMIN_PUSH_BADGE_DIRTY')scheduleUnreadBadgeRefresh(0);
});
document.addEventListener('v21-auth-state',onAuthState);
document.addEventListener('v21-contact-store-change',()=>{void consumePendingOpen();syncState();scheduleUnreadBadgeRefresh();});
document.addEventListener('visibilitychange',()=>{syncState();if(document.visibilityState==='visible')scheduleUnreadBadgeRefresh(0);});
window.addEventListener('focus',()=>{syncState();scheduleUnreadBadgeRefresh(0);});
window.addEventListener('blur',syncState);
document.addEventListener('navigation-change',syncState);
document.addEventListener('v21-active-contact-change',syncState);
document.addEventListener('v21-conversation-context',syncState);

if(isAdmin()){void consumePendingOpen();syncState();scheduleUnreadBadgeRefresh(0);}
else clearClientState();

function snapshot(){return Object.freeze({...state,pendingOpen:pendingOpen?{...pendingOpen}:null});}

state={...state,admin:isAdmin(),supported:isAdmin()&&browserSupported(),permission:typeof Notification==='undefined'?'default':String(Notification.permission||'default'),platform:platform()};
window.V21AdminPush=Object.freeze({version:VERSION,status,enable,disable,syncState,refreshUnreadBadge,handleOpen,snapshot});
})();