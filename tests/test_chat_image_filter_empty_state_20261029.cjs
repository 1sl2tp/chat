'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
function part(start,end){
  const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
  assert(i>=0&&j>i,'owner function exists: '+start);
  return source.slice(i,j);
}
const revoked=[];
const image={src:'old-photo',dataset:{ready:'true'},removeAttribute(k){if(k==='src')delete this.src;}};
const counter={textContent:''};
const timestamp={textContent:''};
const meta={textContent:''};
const prev={hidden:false},next={hidden:false};
let stripRenders=0,filterRenders=0,chipUpdates=0,timeUpdates=0,zoomResets=0,networkLoads=0;
const urls=new Map([['active','blob:photo-old']]);
const ctx=vm.createContext({
  URL:{revokeObjectURL(uri){revoked.push(uri);}},
  imageViewerAllItems:[
    {assetId:'one',senderKey:'self',day:'yesterday',messageId:'a'},
    {assetId:'two',senderKey:'remote',day:'today',messageId:'b'}
  ],
  imageViewerItems:[{assetId:'one',senderKey:'self',day:'yesterday',messageId:'a'}],
  imageViewerIndex:0,
  imageViewerFilter:'self',
  imageViewerTimeFilter:'all',
  IMAGE_VIEWER_TIME_FILTERS:[{key:'all'},{key:'today'},{key:'yesterday'},{key:'week'},{key:'month'}],
  imageViewerAlbumId:'a',
  imageViewerNavigationSeq:10,
  imageViewerImage:image,
  imageViewerOwnedUrls:urls,
  imageViewerCounter:counter,
  imageViewerTimestamp:timestamp,
  imageViewerMeta:meta,
  imageViewerPrev:prev,
  imageViewerNext:next,
  resetImageViewerZoom(){zoomResets++;},
  renderImageViewerFilmstrip(){stripRenders++;},
  renderImageViewerFilters(){filterRenders++;},
  hydrateVisibleViewerThumbs(){},
  updateImageViewerFilterChips(){chipUpdates++;},
  updateImageViewerTimeMenu(){timeUpdates++;},
  updateImageViewerFilmstrip(){},
  viewerTimestampLabel(item){return item?.day||'';},
  viewerMetaLabel(item){return item?.assetId||'';},
  isViewerItemInTimeScope(item,scope){return scope==='all'||item.day===scope;},
  showImageViewerIndex(index){networkLoads++;return Promise.resolve(index);}
});
vm.runInContext(
 part('function applyCurrentImageViewerFilters(','function viewerSourceLabel(')+
 part('function applyImageViewerFilter(','function clampImageViewerZoom(')+
 '\nglobalThis.applyTime=applyImageViewerTimeFilter;globalThis.applySource=applyImageViewerFilter;globalThis.state=()=>({filter:imageViewerFilter,time:imageViewerTimeFilter,items:imageViewerItems,index:imageViewerIndex,seq:imageViewerNavigationSeq});',ctx);
assert.equal(ctx.applyTime('today'),false,'empty intersection is a valid empty state');
let s=ctx.state();
assert.equal(s.filter,'self','keep selected sender source');
assert.equal(s.time,'today','keep user-chosen time instead of silently resetting to All');
assert.equal(s.items.length,0);
assert.equal(s.index,-1);
assert.equal(s.seq,11,'cancel async old photo load');
assert.equal(networkLoads,0,'no media fetch for empty filter');
assert.equal(image.src,undefined,'remove previously viewed photo');
assert.equal(image.dataset.ready,'false');
assert.deepEqual(revoked,['blob:photo-old']);
assert.equal(urls.size,0);
assert.equal(counter.textContent,'0 ảnh');
assert.equal(timestamp.textContent,'Không có ảnh phù hợp bộ lọc');
assert.equal(meta.textContent,'');
assert.equal(prev.hidden,true);
assert.equal(next.hidden,true);
assert(stripRenders===1&&filterRenders===1&&timeUpdates>0&&chipUpdates>0,'render visible filter choices');
// A different source with matching photos recovers the picture normally.
const result=ctx.applySource('remote');
assert(result&&typeof result.then==='function');
s=ctx.state();
assert.equal(s.filter,'remote');
assert.equal(s.time,'today');
assert.equal(s.items.length,1);
assert.equal(s.items[0].assetId,'two');
assert.equal(networkLoads,1);
// Explicitly choose a no-result album: never show all photos instead.
const noAlbum=ctx.applySource('album');
assert.equal(noAlbum,false);
s=ctx.state();
assert.equal(s.filter,'album');
assert.equal(s.time,'today');
assert.equal(s.items.length,0);
assert.equal(networkLoads,1);
// Both All options can be restored by user intent (without duplicated loads).
ctx.applyTime('all');
assert.equal(ctx.state().filter,'album');
assert.equal(ctx.state().items.length,0);
ctx.applySource('all');
s=ctx.state();
assert.equal(s.filter,'all');
assert.equal(s.time,'all');
assert.equal(s.items.length,2);
assert.equal(networkLoads,2);
assert(revoked.length===1,'empty filter release is bounded and idempotent');
console.log('CHAT filtered photo viewer: empty state, no silent fallback, stale load cancellation and recovery PASS');
