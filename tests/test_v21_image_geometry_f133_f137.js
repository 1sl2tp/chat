// F-133..F-137: real image presentation math, gallery and viewer invariants.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('index.source.html','utf8');
const start=app.indexOf('function imageAspectRatio(');
const end=app.indexOf('function singleImageDisplayWidth(',start);
assert(start>=0&&end>start);
const segment=app.slice(start,end);
function present(height,ratio){
  return new Function('document','window','media',
    segment+'\nreturn singleImagePresentation(media);')(
    {documentElement:{clientHeight:height}},{innerHeight:height},{aspectRatio:ratio});
}
for(const h of [568,667,736,844,1024]){
  for(const ratio of [.12,.22,.5,.75,.99]){
    const p=present(h,ratio);
    assert.equal(p.kind,'portrait');
    assert.equal(p.width,Math.min(260,Math.max(1,Math.floor(560*ratio))));
    assert.equal(p.aspectRatio,ratio);
    assert(p.width/ratio<=561,'portrait frame must not crop');
  }
}
assert.equal(present(667,1).kind,'square');
assert.equal(present(667,1).width,320);
for(const ratio of [1.01,1.15,1.78,2.5,4.5,9]){
  const p=present(667,ratio);
  assert.equal(p.kind,'landscape');
  assert.equal(p.width,360);
  assert.equal(p.aspectRatio,ratio,'retain full original aspect');
}
assert(!app.includes('messageInlineImageHeightLimit'));
assert(!app.includes('scheduleImagePresentationResize'));
assert(css.includes('max-height:560px;'));
assert(!css.includes('max-height:min(48dvh,460px);'));
assert(css.includes('width:min(22.5rem,var(--message-media-width,22.5rem))'));
assert(css.includes('object-fit:contain!important'));
assert(css.includes('object-fit:cover!important'));
const activeCss=css.slice(css.lastIndexOf('.image-review-thumb[aria-current="true"]{'));
const currentRule=activeCss.split('}',1)[0];
assert(currentRule.includes('border-color:rgba(255,255,255,.92);'));
assert(currentRule.includes('transform:none;'));
assert(!currentRule.includes('border-color:#0a84ff;'));
assert(!currentRule.includes('translateY(-2px)'));
const viewer=app.slice(app.indexOf('async function openImageViewer('),app.indexOf('async function hydrateImageElement('));
assert(viewer.includes("imageViewerFilter='all';"));
assert(!viewer.includes('v21_mark_read'));
console.log('F-133..F-137 image geometry/gallery/viewer contract PASS');

// CHAT-ORDER-IMAGE-20261117: order notice preview is not a generic portrait.
// Keep exact 16A chat identity; ordinary photo/Gallery width contracts above
// remain 260/560, 320/360 respectively.
const orderStart=app.indexOf('const ORDER_NOTICE_PORTRAIT_WIDTH_PX=');
const orderEnd=app.indexOf('function singleImagePresentation(',orderStart);
assert(orderStart>0&&orderEnd>orderStart);
const tagged=new Function('message',
  app.slice(orderStart,orderEnd)+'\nreturn isTaphoaOrderImageMessage(message);');
const committed='taphoa:123e4567-e89b-42d3-a456-426614174000:';
for(const command of ['order','order-edit','deliver','staff-order']){
  assert.equal(tagged({clientId:committed+command,media:{type:'image'}}),true,command);
}
for(const sample of [
  {clientId:committed+'order',media:{type:'gallery'}},
  {clientId:committed+'order',media:{type:'file'}},
  {clientId:'photo-from-user',media:{type:'image'}},
  {clientId:committed+'payment',media:{type:'image'}}
]) assert.equal(tagged(sample),false,'never enlarge other private photos');
assert(app.includes('ORDER_NOTICE_PORTRAIT_WIDTH_PX=320'));
assert(app.includes('ORDER_NOTICE_PORTRAIT_MAX_HEIGHT_PX=760'));
assert(app.includes("mediaShell.dataset.orderNotice=isTaphoaOrderImageMessage(message)?'true':'false'"));
assert(app.includes("if(mediaShell.dataset.orderNotice==='true')"));
assert(css.includes('.message-media-shell[data-order-notice="true"] > .media-image-tile[data-image-presentation="portrait"]'));
assert(css.includes('max-height:none;'));
console.log('CHAT-ORDER-IMAGE-20261117 exact order media identity/readable aspect PASS');
