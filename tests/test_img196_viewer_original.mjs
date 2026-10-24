import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const APP=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=APP.indexOf('async function loadViewerAssetSource(item,');
const end=APP.indexOf('function renderImageViewerFilmstrip()',start);
assert(start>=0&&end>start,'viewer source loader not found');
assert(APP.includes('loadViewerAssetSource(item,{thumbnail:true})'),'filmstrip uses preview mode');
assert(APP.includes('source.quality===\'preview\'?\' · Chỉ có bản xem trước\':\'\''));
assert(APP.includes('const resolution=Number(item.width)>0&&Number(item.height)>0'));
assert(APP.includes('imageViewerImage.dataset.qualitySource=source.quality'));
assert(APP.includes('if(navId!==imageViewerNavigationSeq||!imageViewerOverlay?.open)'));
assert(!APP.includes("if(!item||item.previewUrl)return true;"),
 'image neighbor prewarm cannot skip storage just because preview exists');

const photo=new Blob(['HIGH QUALITY STORED ASSET'],{type:'image/jpeg'});
let calls=[],mode='cached';
const ctx={
 Blob,
 URL:{createObjectURL(blob){assert.equal(blob,photo);return 'blob:full-resolution';}},
 currentMediaAccountId:()=> 'account1',
 window:{
  V21MediaCache:{async get(){calls.push('cache');return mode==='cached'?{blob:photo}:null}},
  V21SyncEngine:{async ensureMediaRemote(){calls.push('remote');if(mode==='fail')throw Error('offline');return{blob:photo}}}
 }
};
const loader=vm.runInNewContext(APP.slice(start,end)+'\nloadViewerAssetSource;',ctx);
const item={assetId:'asset1',accountId:'account1',previewUrl:'blob:thumbnail',width:1178,height:2560};
let result=await loader(item);
assert.equal(result.src,'blob:full-resolution');
assert.equal(result.quality,'stored');
assert.equal(result.owned,true);
assert.deepEqual(calls,['cache'],'preview did not bypass cached original');
mode='remote';calls=[];
result=await loader(item);
assert.equal(result.quality,'stored');
assert.deepEqual(calls,['cache','remote'],'original loaded from remote storage on miss');
mode='remote';calls=[];
result=await loader(item,{thumbnail:true});
assert.equal(result.src,'blob:thumbnail');
assert.equal(result.quality,'preview');
assert.deepEqual(calls,[],'thumbnail does not hydrate full-resolution image');
mode='fail';calls=[];
result=await loader(item);
assert.equal(result.src,'blob:thumbnail');
assert.equal(result.quality,'preview','offline fallback retains preview');
assert.deepEqual(calls,['cache','remote']);
calls=[];
result=await loader({...item,accountId:'different-account'});
assert.equal(result.src,'');
assert.equal(result.quality,'missing','never use cross-account previews');
assert.deepEqual(calls,[]);
console.log('IMG-196 original media priority + preview thumbnail + offline fallback PASS');
