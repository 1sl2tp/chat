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
  for(const ratio of [.22,.36,.5,.75,.81]){
    const actual=present(h,ratio);
    const cap=Math.min(460,Math.floor(h*.48));
    assert.equal(actual.kind,'portrait');
    assert.equal(actual.width,Math.min(360,Math.max(1,Math.round(cap*ratio))));
    assert.equal(actual.aspectRatio,ratio);
    assert(actual.width/ratio<=cap+3,'portrait overflows vertical cap');
  }
}
for(const ratio of [1,1.15,1.78,2.5,4.5]){
  const p=present(667,ratio);
  assert.equal(p.width,360);
  assert.equal(p.aspectRatio,ratio,'landscape ratio must stay intrinsic');
}
assert(app.includes("window.addEventListener('orientationchange',scheduleImagePresentationResize"));
assert(app.includes("root.querySelectorAll('.media-image-tile[data-image-presentation=\"portrait\"]')"));
assert(app.includes("if(aspectRatio>0)applySingleImagePresentation(tile,{aspectRatio});"));
assert(css.includes('max-height:min(48dvh,460px);'));
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
