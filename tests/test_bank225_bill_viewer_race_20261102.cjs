'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('bank-report-dashboard.js','utf8');
const start=src.indexOf('function closeViewer(){');
const end=src.indexOf('function synchronize(){',start);
assert(start>0&&end>start);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const owners={id:'admin-a',session:'session-a'};
function element(tag,cls='',text=''){
 return {tag,cls,textContent:String(text),children:[],hidden:false,isConnected:true,
  addEventListener(){},appendChild(child){this.children.push(child);return child;},
  replaceChild(next,old){const i=this.children.indexOf(old);assert(i>=0);this.children[i]=next;}};
}
const viewer=element('viewer');viewer.hidden=true;
viewer.replaceChildren=function(){this.children=[];};
const media={},created=[],revoked=[];
const ctx={
 ui:{viewer},viewerSequence:0,imageObjectUrl:null,active:true,
 reportSessionOwner:owners.id+'|'+owners.session,
 bankReportSessionOwner:()=>owners.id+'|'+owners.session,
 isReportContact:()=>true,
 window:{
  V21AuthSessionStore:{snapshot:()=>({account:{id:owners.id},appSessionId:owners.session})},
  V21MediaCache:{get:({assetId})=>{media[assetId]??=deferred();return media[assetId].promise;}},
  V21SyncEngine:{ensureMediaRemote:async()=>({blob:new Blob(['remote'])})},
  ChatAppShell:{NavigationCommand:{openContact(){}}}
 },
 URL:{createObjectURL(blob){created.push(blob);return 'blob:'+created.length;},
  revokeObjectURL(url){revoked.push(url);}},
 Blob,el:element,append:(parent,...kids)=>{kids.forEach(k=>parent.appendChild(k));return parent;}
};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx,{timeout:1000});
const row=(id)=>({asset_id:id,customer_name:'Khách '+id,customer_id:'customer-'+id});
const visibleImage=()=>viewer.children[0]?.children[0]?.children.find(x=>x.tag==='img');
(async()=>{
 const a=ctx.showBill(row('A')),b=ctx.showBill(row('B'));
 media.B.resolve({blob:new Blob(['new'])});await b;
 assert.equal(visibleImage()?.alt,'Bill gốc của Khách B');
 assert.equal(created.length,1);
 media.A.resolve({blob:new Blob(['old'])});await a;
 assert.equal(visibleImage()?.alt,'Bill gốc của Khách B','old image cannot overwrite reopened viewer');
 assert.equal(created.length,1,'stale media cannot allocate a new object URL');
 const c=ctx.showBill(row('C'));
 owners.id='admin-b';owners.session='session-b';
 ctx.reportSessionOwner='admin-b|session-b';
 media.C.resolve({blob:new Blob(['private A'])});await c;
 assert.equal(visibleImage(),undefined,'old Admin image cannot display under B');
 assert.equal(created.length,1);
 ctx.closeViewer();assert(viewer.hidden);
 assert.deepEqual(revoked,['blob:1'],'close revokes only the live URL');
 const d=ctx.showBill(row('D'));
 ctx.closeViewer();media.D.reject(Error('network'));
 await d;
 assert.equal(viewer.children.length,0,'a rejected closed viewer cannot append fallback controls');
 assert.equal(created.length,1);
 console.log('BANK-225: bill image open race, account switch and stale rejection PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
