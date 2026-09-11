'use strict';
const RELEASE_VERSION='V21.72.39';
const MODULE_CONTRACT_VERSION='pwa-sw-v1';
const CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION;
const SHELL=['./','./manifest.webmanifest','./icons/chat-192.png','./icons/chat-512.png'];
const adminPushClientState=new Map();
let adminPushBadgeCount=0;

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE_NAME);
      await cache.addAll(SHELL);
    }catch{}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('taphoa-chat-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function clearAdminPushBadge(){
  adminPushBadgeCount=0;
  try{if(typeof navigator?.clearAppBadge==='function')await navigator.clearAppBadge();}catch{}
}
async function bumpAdminPushBadge(){
  adminPushBadgeCount+=1;
  try{if(typeof navigator?.setAppBadge==='function')await navigator.setAppBadge(adminPushBadgeCount);}catch{}
}

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')void self.skipWaiting();
  if(event.data?.type==='ADMIN_PUSH_STATE'&&event.source?.id){
    const state={...event.data,updatedAt:Date.now()};
    adminPushClientState.set(event.source.id,state);
    if(state.visible&&state.focused)void clearAdminPushBadge();
  }
  if(event.data?.type==='ADMIN_PUSH_CLEAR'&&event.source?.id){
    adminPushClientState.delete(event.source.id);
    void clearAdminPushBadge();
  }
});

self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload=null;
    try{payload=event.data?.json?.()||null;}catch{return;}
    if(!payload||typeof payload!=='object')return;
    const conversationId=String(payload.conversation_id||'');
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const readingSame=clients.some(client=>{
      const state=adminPushClientState.get(client.id);
      return Boolean(
        state&&state.visible&&state.focused&&state.route==='chat'&&
        String(state.conversationId||'')===conversationId
      );
    });
    if(readingSame){await clearAdminPushBadge();return;}

    await self.registration.showNotification(String(payload.title||'TAPHOA Chat'),{
      body:String(payload.body||'Tin nhắn mới'),
      icon:String(payload.icon||'./icons/chat-192.png'),
      badge:'./icons/chat-192.png',
      tag:String(payload.tag||('chat:'+conversationId)),
      renotify:true,
      data:{
        conversationId,
        contactId:String(payload.contact_id||''),
      }
    });
    await bumpAdminPushBadge();
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification?.close?.();
  event.waitUntil((async()=>{
    const data=event.notification?.data||{};
    const conversationId=String(data.conversationId||'');
    const contactId=String(data.contactId||'');
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(clients.length){
      const client=clients[0];
      try{await client.focus?.();}catch{}
      try{client.postMessage?.({type:'ADMIN_PUSH_OPEN',conversationId,contactId});}catch{}
      await clearAdminPushBadge();
      return;
    }
    const target=new URL('./',self.location.origin);
    if(contactId)target.searchParams.set('push_contact',contactId);
    if(conversationId)target.searchParams.set('push_conversation',conversationId);
    await self.clients.openWindow(target.toString());
    await clearAdminPushBadge();
  })());
});

async function networkFirst(request,{navigation=false}={}){
  const networkRequest=new Request(request,{cache: 'no-store'});
  try{
    const response=await fetch(networkRequest);
    if(response&&response.ok&&new URL(request.url).origin===self.location.origin){
      const cache=await caches.open(CACHE_NAME);
      void cache.put(request,response.clone()).catch(()=>{});
      if(navigation)void cache.put('./',response.clone()).catch(()=>{});
    }
    return response;
  }catch(error){
    const cached=await caches.match(request);
    if(cached)return cached;
    if(navigation){
      const shell=await caches.match('./');
      if(shell)return shell;
    }
    throw error;
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/version.json')||url.pathname.endsWith('version.json')){
    event.respondWith(fetch(new Request(request,{cache: 'no-store'})));
    return;
  }
  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,{navigation:true}));
    return;
  }
  event.respondWith(networkFirst(request));
});
