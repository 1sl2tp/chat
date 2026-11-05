'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('async function upgradeVisibleImageViewerToOriginal(');
const stop=app.indexOf("document.addEventListener('v21-media-removed',event=>{",start);
const onlineStart=app.indexOf("window.addEventListener('online',()=>{",stop);
const onlineStop=app.indexOf("window.addEventListener('pagehide',()=>{",onlineStart);
assert(start>0&&stop>start&&onlineStart>stop&&onlineStop>onlineStart,'real viewer hydration wiring exists');
const runtime=app.slice(start,stop)+'\n'+app.slice(onlineStart,onlineStop);
const photo=new Blob(['original-image-bytes'],{type:'image/jpeg'});
async function drain(){for(let i=0;i<50;i++)await Promise.resolve();}
function fixture(){
 const events=new Map(),windowEvents=new Map(),revoked=[];
 let created=0,downloads=0,lookup=async()=>({blob:photo}),remote=async()=>({blob:photo});
 const ctx={Blob,Map,Number,String,Math,Promise,
  URL:{createObjectURL(blob){assert.equal(blob,photo);return'blob:original-'+(++created);},revokeObjectURL(url){revoked.push(url);}},
  imageViewerOverlay:{open:true},imageViewerImage:{src:'blob:preview',dataset:{ready:'true',qualitySource:'preview'}},
  imageViewerItems:[{accountId:'A',assetId:'asset-A',width:881,height:1920}],imageViewerIndex:0,
  imageViewerSessionSeq:1,imageViewerNavigationSeq:1,imageViewerZoom:1.91,imageViewerPanX:22,imageViewerPanY:7,
  imageViewerOwnedUrls:new Map(),imageViewerMeta:{textContent:''},
  currentOwner:'A',currentMediaAccountId(){return ctx.currentOwner;},
  viewerMetaLabel(){return'B · 1 ảnh · 21:26';},
  retryMountedImageHydration(){return 0;},
  document:{addEventListener(k,cb){events.set(k,cb);},querySelectorAll(){return[];}},
  addEventListener(k,cb){windowEvents.set(k,cb);},
  requestAnimationFrame(cb){cb();return 1;}
 };
 ctx.V21MediaCache={get(){return lookup();}};
 ctx.V21SyncEngine={ensureMediaRemote(){downloads++;return remote();}};
 ctx.window=ctx;
 vm.createContext(ctx);vm.runInContext(runtime,ctx);
 return{ctx,revoked,created:()=>created,downloads:()=>downloads,
  emit(assetId='asset-A',accountId='A'){events.get('v21-media-ready')({detail:{assetId,accountId}});},
  online(){windowEvents.get('online')();},setLookup(fn){lookup=fn;},setRemote(fn){remote=fn;}};
}
(async()=>{
 const f=fixture();f.emit();await drain();
 assert.equal(f.ctx.imageViewerImage.dataset.qualitySource,'stored','viewer must upgrade after media ready');
 assert.equal(f.ctx.imageViewerImage.src,'blob:original-1');
 assert.match(f.ctx.imageViewerMeta.textContent,/Tệp lưu 881×1920 px/);
 assert.equal(f.ctx.imageViewerZoom,1.91,'zoom is preserved');
 assert.equal(f.ctx.imageViewerPanX,22,'pan is preserved');
 f.emit();await drain();assert.equal(f.created(),1,'stored photo not reloaded');
 const other=fixture();other.emit('other-asset');other.emit('asset-A','other-account');await drain();
 assert.equal(other.created(),0,'unrelated or cross-account events cannot paint viewer');
 const nav=fixture();let release;
 nav.setLookup(()=>new Promise(resolve=>{release=resolve;}));
 nav.emit();await drain();nav.ctx.imageViewerNavigationSeq++;
 nav.ctx.imageViewerItems[0]={accountId:'A',assetId:'asset-B'};
 release({blob:photo});await drain();
 assert.equal(nav.created(),0,'late photo does not overwrite new photo');
 const account=fixture();let unlock;
 account.setLookup(()=>new Promise(resolve=>{unlock=resolve;}));
 account.emit();await drain();account.ctx.currentOwner='B';
 unlock({blob:photo});await drain();
 assert.equal(account.created(),0,'late prior-account photo cannot paint new login');
 const recovery=fixture();recovery.setLookup(async()=>null);
 recovery.online();await drain();
 assert.equal(recovery.downloads(),1,'online fetch is limited to visible viewer asset');
 assert.equal(recovery.ctx.imageViewerImage.dataset.qualitySource,'stored');
 assert.equal(recovery.ctx.imageViewerZoom,1.91);
 console.log('Late full-resolution viewer, offline reconnect and session fencing PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
