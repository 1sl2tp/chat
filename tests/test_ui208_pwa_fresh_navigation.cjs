// UI-208: An installed PWA or browser tab must NOT render a stale HTML shell
// while online. Web, Android PWA and iOS PWA share the same SW navigation path.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');

function makeHarness(){
 const origin='https://chat.taphoa.xyz';
 const handlers={};
 const cacheSets=new Map();
 const requested=[];
 let online=true,storageWorks=true,activeHtml='CURRENT-WEB-BUILD';
 class FakeRequest{
  constructor(input,options={}){
   const base=input instanceof FakeRequest?input:null;
   this.url=new URL(base?.url||String(input),origin+'/').href;
   this.method=base?.method||'GET';
   this.mode=options.mode||base?.mode||'cors';
   this.cache=options.cache||base?.cache||'default';
   this.destination=base?.destination||'';
  }
 }
 class FakeResponse{
  constructor(body){this.body=body;this.ok=true;this.status=200;this.type='basic';}
  clone(){return new FakeResponse(this.body);}
 }
 class FakeCache{
  constructor(){this.entries=new Map();}
  async addAll(requests){
   for(const request of requests){
    const response=await network(request);
    this.entries.set(new URL(request.url).href,response.clone());
   }
  }
  async put(request,response){
   const url=new URL(request instanceof FakeRequest?request.url:request,origin+'/').href;
   this.entries.set(url,response.clone());
  }
  async match(request){
   const url=new URL(request instanceof FakeRequest?request.url:request,origin+'/').href;
   return this.entries.get(url)||null;
  }
 }
 const caches={
  async open(name){
   if(!storageWorks)throw Error('CacheStorage unavailable');
   if(!cacheSets.has(name))cacheSets.set(name,new FakeCache());
   return cacheSets.get(name);
  },
  async keys(){return [...cacheSets.keys()]},
  async delete(key){return cacheSets.delete(key)},
  async match(request){for(const cache of cacheSets.values()){
   const found=await cache.match(request);if(found)return found;
  }return null;}
 };
 async function network(request){
  requested.push({url:request.url,cache:request.cache});
  if(!online)throw Error('offline');
  return new FakeResponse(new URL(request.url).pathname==='/'?activeHtml:
   new URL(request.url).pathname==='/version.json'?'LATEST-VERSION':'STATIC-ASSET');
 }
 const context={
  self:{
   location:{origin},addEventListener(type,fn){handlers[type]=fn},
   skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]},
   registration:{showNotification:async()=>{}}
  },
  Request:FakeRequest,URL,fetch:network,caches,navigator:{},
  Date,Map,Promise,JSON,String,Number,Boolean,Object,Array,Set,console
 };
 vm.createContext(context);
 vm.runInContext(sw,context,{timeout:3000});
 async function dispatch(type,properties={}){
  const pending=[];let responsePromise=null;
  const event={
   ...properties,
   waitUntil(p){pending.push(Promise.resolve(p));},
   respondWith(p){responsePromise=Promise.resolve(p)}
  };
  handlers[type](event);
  const response=await responsePromise;
  await Promise.all(pending);
  return response;
 }
 return{
  origin,requested,caches,cacheSets,FakeRequest,FakeResponse,dispatch,
  setOnline:v=>online=v,setStorageWorks:v=>storageWorks=v,
  setCurrentHtml:v=>activeHtml=v,
  cacheName:[...sw.matchAll(/pwa-first-paint-guard-20261024/g)].length===1
 };
}
(async()=>{
 const h=makeHarness();
 assert(h.cacheName,'new shell epoch must invalidate the obsolete cached worker');
 const legacy=await h.caches.open('taphoa-chat-shell-V21.72.39-pinned-bank-report-contact-20261023');
 await legacy.put('./',new h.FakeResponse('<button id="remote">B+</button>'));
 await h.dispatch('install');
 await h.dispatch('activate');
 assert(!(await h.caches.keys()).some(k=>k.includes('pinned-bank-report-contact')),
  'old offline shell cache must be deleted at activation');
 const installedCache=(await h.caches.keys()).find(k=>k.includes('pwa-first-paint-guard'));
 assert(installedCache,'new cache epoch must exist');

 // Simulate a *stale cache with B+* even in a newly activated worker.
 const active=await h.caches.open(installedCache);
 await active.put('./',new h.FakeResponse('<button id="remote">B+</button>'));
 for(const runtime of ['desktop-web','mobile-web','ios-pwa','android-pwa']){
  const req=new h.FakeRequest('./',{mode:'navigate'});
  const rendered=await h.dispatch('fetch',{request:req});
  assert.equal(rendered.body,'CURRENT-WEB-BUILD',runtime+' may never render cached B+ while online');
  assert.equal(h.requested.at(-1).cache,'no-store',runtime+' must bypass HTTP cache');
 }
 assert.equal((await active.match('./')).body,'CURRENT-WEB-BUILD',
  'healthy navigation also repairs the offline shell');
 h.setOnline(false);
 const offline=await h.dispatch('fetch',{request:new h.FakeRequest('./',{mode:'navigate'})});
 assert.equal(offline.body,'CURRENT-WEB-BUILD','offline PWA must keep last known clean Chat');
 h.setOnline(true);
 h.setCurrentHtml('NEWEST-WEB-BUILD');
 const deep=await h.dispatch('fetch',{request:new h.FakeRequest('./?push_friend=1',{mode:'navigate'})});
 assert.equal(deep.body,'NEWEST-WEB-BUILD','Push deep-link loads newest Chat');
 assert.equal((await active.match('./')).body,'NEWEST-WEB-BUILD');
 assert(h.requested.at(-1).url.includes('push_friend=1'),'Push deep-link query preserved');
 const version=await h.dispatch('fetch',{request:new h.FakeRequest('./version.json')});
 assert.equal(version.body,'LATEST-VERSION');
 assert.equal(h.requested.at(-1).cache,'no-store');
 h.setStorageWorks(false);
 const withoutStorage=await h.dispatch('fetch',{request:new h.FakeRequest('./',{mode:'navigate'})});
 assert.equal(withoutStorage.body,'NEWEST-WEB-BUILD','private Safari without CacheStorage must still load online');
 console.log('UI-208 PWA/browser/mobile fresh-navigation + offline fallback PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
