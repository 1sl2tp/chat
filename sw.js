'use strict';
const RELEASE_VERSION='V21.72.27';
const MODULE_CONTRACT_VERSION='pwa-sw-v1';
const CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION;
const SHELL=['./','./manifest.webmanifest','./icons/chat-192.png','./icons/chat-512.png'];

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

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')void self.skipWaiting();
});

async function networkFirst(request,{navigation=false}={}){
  const networkRequest=new Request(request,{cache: 'no-store'});
  try{
    const response=await fetch(networkRequest);
    if(response&&response.ok&&new URL(request.url).origin===self.location.origin){
      const cache=await caches.open(CACHE_NAME);
      void cache.put(request,response.clone()).catch(()=>{});
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
