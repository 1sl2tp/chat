'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','index.source.html'),'utf8');
const startClamp=app.indexOf('function clampImageViewerPan(){');
const endClamp=app.indexOf('function updateImageViewerZoomControls(){',startClamp);
const startZoom=app.indexOf('function imageViewerFittedOriginalSize(){');
const endZoom=app.indexOf('function resetImageViewerZoom(){',startZoom);
assert(startClamp>=0&&endClamp>startClamp&&startZoom>=0&&endZoom>startZoom,
 'real viewer zoom owner must remain available');
assert.match(app.slice(startZoom,endZoom),/width:naturalWidth\*fit,height:naturalHeight\*fit/);
assert.match(app.slice(startZoom,endZoom),/style\.maxWidth='none'/);
assert.match(app.slice(startZoom,endZoom),/style\.flexShrink='0'/);
assert.match(app.slice(startZoom,endZoom),/if\(zoom!==1&&!layoutZoomed\)parts\.push/);
assert.match(app,/image\.addEventListener\('load',\(\)=>\{/);
assert.match(app,/if\(imageViewerZoom>1\)applyImageViewerTransform\(\);/);
assert.match(css,/will-change:auto;/);
const baseRatio=881/1920,baseHeight=600,baseWidth=baseHeight*baseRatio;
function fixture({nativeWidth=881,nativeHeight=1920,zoom=3.3,rot=0}={}){
 const style={},dataset={chatImageRotation:String(rot)};
 const img={naturalWidth:nativeWidth,naturalHeight:nativeHeight,style,dataset,
   get offsetWidth(){return Number.parseFloat(style.width)||baseWidth;},
   get offsetHeight(){return Number.parseFloat(style.height)||baseHeight;}};
 const main={dataset:{}};
 const ctx={imageViewerImage:img,imageViewerMain:main,
   imageViewerZoom:zoom,imageViewerPanX:300,imageViewerPanY:800,
   Number,Math,String,
   imageViewerRotation:()=>rot,
   imageViewerContentViewport:()=>({width:760,height:600}),
   updateImageViewerZoomControls:()=>{}};
 vm.createContext(ctx);
 vm.runInContext(app.slice(startClamp,endClamp)+'\n'+app.slice(startZoom,endZoom),ctx);
 return {ctx,img,main,apply:()=>vm.runInContext('applyImageViewerTransform()',ctx)};
}
const x=fixture();x.apply();
const width=Number.parseFloat(x.img.style.width);
const height=Number.parseFloat(x.img.style.height);
assert(Math.abs(width-baseWidth*3.3)<.02, 'the actual IMG layout width must grow with zoom');
assert(Math.abs(height-1980)<.02,'render image at 330% height using original pixels');
assert.equal(x.img.dataset.layoutZoomed,'true');
assert.equal(x.img.style.maxWidth,'none');
assert.equal(x.img.style.maxHeight,'none');
assert.equal(x.img.style.flexShrink,'0');
assert(!x.img.style.transform.includes('scale('),
 'a decoded photo must NEVER zoom a low-resolution CSS texture');
assert(Math.abs(x.ctx.imageViewerPanX-(width-760)/2)<.1,
 'pan must clamp to the expanded element once, not multiply zoom twice');
assert.equal(x.ctx.imageViewerPanY,690);
x.ctx.imageViewerZoom=1;x.apply();
assert.equal(x.img.style.width,'');
assert.equal(x.img.style.height,'');
assert.equal(x.img.style.maxWidth,'');
assert.equal(x.img.style.flexShrink,'');
assert.equal(x.img.dataset.layoutZoomed,'false');
assert.equal(x.img.style.transform,'');
const pending=fixture({nativeWidth:0,nativeHeight:0,zoom:2.5});
pending.apply();
assert.match(pending.img.style.transform,/scale\(2\.5\)/,
 'preview or loading state remains viewable while the decoder is pending');
pending.img.naturalWidth=881;pending.img.naturalHeight=1920;
pending.apply();
assert.equal(pending.img.dataset.layoutZoomed,'true',
 'on image load, the zoom re-renders at native detail');
assert(!pending.img.style.transform.includes('scale('));
const rotated=fixture({zoom:2,rot:90});
rotated.apply();
assert.match(rotated.img.style.transform,/rotate\(90deg\)/);
assert.equal(rotated.img.dataset.layoutZoomed,'true');
assert(Math.abs(rotated.ctx.imageViewerPanX-220)<.1,
 '90-degree pan clamping uses rotated pixel dimensions');
// Hydration still uses the original stored blob from V21MediaCache.
assert.match(app,/async function loadViewerAssetSource\(item,\{thumbnail=false\}=\{\}\)/);
assert.match(app,/if\(thumbnail&&preview\)return\{src:preview,owned:false,quality:'preview'\}/);
assert.match(app,/return\{src:URL\.createObjectURL\(row\.blob\),owned:true,quality:'stored'\}/);
assert(!app.slice(startZoom,endZoom).includes('ensureMediaRemote'),
 'zoom itself must not cause extra storage requests');
console.log('IMG-275 original photo zoom layout + decoded pixel resolution + pan/rotate/fallback PASS');
