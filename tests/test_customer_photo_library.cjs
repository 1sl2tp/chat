'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const gallery=fs.readFileSync('customer-photo-library.js','utf8');
const shell=fs.readFileSync('shell.js','utf8');
const source=fs.readFileSync('index.source.html','utf8');
const viewer=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('customer-photo-library.css','utf8');
assert(source.includes('data-top-tab="photos" data-nav-target="photos"'));
assert(!source.includes('data-top-tab="work" data-nav-target="work">Công việc'));
assert(source.includes('id="customerPhotoLibrary"'));
assert(source.includes('customer-photo-library.js" data-build-source'));
assert(source.includes('customer-photo-library.css" data-build-source'));
assert(shell.includes('const WORK_ENABLED=false;'));
assert(shell.includes("openPhotos(){return this.open('photos')}"));
assert(shell.includes("workView.hidden=WORK_ENABLED"));
assert(viewer.includes('window.V21ChatImageViewer=Object.freeze({open:openImageViewer})'));
assert(css.includes('#customerPhotoLibrary[hidden]'));
assert(gallery.includes('IntersectionObserver'));
assert(!gallery.includes("v21_media_assets"));
const start=gallery.indexOf('function imageMeta(');
const end=gallery.indexOf('function dateLabel(',start);
assert(start>=0&&end>start);
const context={String,Array,Date,Number,Boolean};
vm.createContext(context);
vm.runInContext(gallery.slice(start,end)+';globalThis.select=photoItems;',context);
const row=(id,conversation,kind,created,extra={})=>({
 asset_id:id,remote_meta:{
 id,conversation_id:conversation,kind,created_at:created,...extra
 }
});
const rows=[
 row('old-image','customer-conv','image','2026-10-20T09:00:00Z'),
 row('new-image','customer-conv','image','2026-10-21T09:00:00Z'),
 row('different-customer','other-conv','image','2026-10-22T09:00:00Z'),
 row('deleted-image','customer-conv','image','2026-10-22T09:00:00Z',{deleted_at:'2026-10-22'}),
 row('bank-pdf','customer-conv','file','2026-10-22T09:00:00Z',{mime_type:'application/pdf'})
];
const items=context.select(rows,'customer-conv','admin-1');
assert.deepEqual(Array.from(items,x=>x.id),['new-image','old-image'],'only existing images of the selected customer, newest first');
assert(items.every(x=>x.accountId==='admin-1'));
console.log('Customer Photos route, privacy, activity ordering and lazy assets PASS');
