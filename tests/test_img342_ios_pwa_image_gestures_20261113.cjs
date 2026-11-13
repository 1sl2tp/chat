'use strict';
// IMG-342: mobile/iOS PWA image viewer must own its native touch gestures
// without leaking zoom to the PWA shell or mistaking a pinch for a swipe.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const orientation=fs.readFileSync(path.join(root,'chat-image-orientation.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const start=app.indexOf('function installIOSImageViewerTouchGestures(main,image){');
const end=app.indexOf('function ensureImageViewer(){',start);
assert(start>0&&end>start,'IMG-342 native iOS touch owner exists');
const snippet=app.slice(start,end);
assert.match(app,/if\(imageViewerUseNativeIOSTouch\)installIOSImageViewerTouchGestures\(main,image\)/);
assert((app.match(/if\(imageViewerUseNativeIOSTouch&&event\.pointerType==='touch'\)return;/g)||[]).length>=7,
  'iOS pointer events cannot duplicate native touch navigation');
assert.match(snippet,/touchstart/);
assert.match(snippet,/touchmove/);
assert.match(snippet,/touchend/);
assert.match(snippet,/touchcancel/);
assert.match(snippet,/passive:false/);
assert.match(snippet,/contacts\.size>=2/);
assert.match(snippet,/Math\.abs\(dx\)>45/);
assert.match(snippet,/setImageViewerZoom\(imageViewerZoom>1\?1:2\.5/);
assert.match(orientation,/\.image-viewer-overlay\[open\] \.image-review-head\{z-index:12\}/);
assert.match(orientation,/bottom:calc\(7\.8rem \+ env\(safe-area-inset-bottom,0px\)\)/);
assert.match(sw,/SHELL_CACHE_EPOCH='pwa-chat-ios-viewer-webkit-img343-20261113'/);

class Element{closest(){return null;}}
const image=new Element();
const controls=new Element();
controls.closest=selector=>selector==='button'?controls:null;
const listeners=new Map();
const main={
  getBoundingClientRect(){return{left:0,top:0,width:400,height:600};},
  contains(target){return target===image;},
  addEventListener(type,callback,options){
    listeners.set(type,{callback,options});
  }
};
let now=1000,clock=1000;
const navigation=[],closed=[],transforms=[];
const ctx={
  Map,Math,Number,Element,Date:{now:()=>clock},performance:{now:()=>now},
  imageViewerPinchRendering:false,imageViewerPinchBaseZoom:1,
  imageViewerPointers:new Map(),imageViewerTouchStarts:new Map(),
  imageViewerGesture:null,imageViewerGesturePinched:false,
  imageViewerPanX:0,imageViewerPanY:0,imageViewerZoom:1,
  imageViewerIndex:5,
  imageViewerLastTouchTapAt:0,imageViewerLastTouchTapX:0,imageViewerLastTouchTapY:0,
  imageViewerTimeMenuPanel:null,
  clampImageViewerZoom:z=>Math.max(1,Math.min(5,z)),
  closeImageViewer(options){closed.push(options);},
  showImageViewerIndex(i){navigation.push(i);},
  toggleImageViewerTimeMenu(){throw Error('no time menu');},
  applyImageViewerTransform(){transforms.push([ctx.imageViewerZoom,ctx.imageViewerPanX,ctx.imageViewerPanY]);},
  setImageViewerZoom(next){
    ctx.imageViewerZoom=next;
    ctx.imageViewerPanX=0;ctx.imageViewerPanY=0;
  }
};
ctx.main=main;
ctx.image=image;
vm.createContext(ctx);
vm.runInContext(snippet+';installIOSImageViewerTouchGestures(main,image);',ctx);
// All event callbacks and assertions share the same contextified state.
function touch(id,x,y){return{identifier:id,clientX:x,clientY:y};}
function fire(type,changedTouches,target=image){
  const {callback,options}=listeners.get(type)||{};
  assert(callback,type+' listener missing');
  assert.equal(options.passive,type==='touchcancel');
  let prevented=false;
  callback({
    target,changedTouches,cancelable:true,
    preventDefault(){prevented=true;}
  });
  if(type!=='touchcancel')assert(prevented,type+' must suppress native page zoom');
}
assert.equal(listeners.size,7,'four Touch Events and three WebKit GestureEvents');
// Execute a fresh fixture with a shared ctx. (The handlers close over their VM
// context; the following asserts check the transform callbacks from that VM.)
fire('touchstart',[touch(1,100,250)]);
fire('touchstart',[touch(2,200,250)]);
fire('touchmove',[touch(2,300,250)]);
assert(transforms.some(a=>a[0]>1.9),'pinch must enlarge the selected photo');
fire('touchend',[touch(1,100,250),touch(2,300,250)]);
assert.equal(navigation.length,0,'pinch must never advance the gallery');
const before=transforms.length;
fire('touchstart',[touch(3,120,250)]);
fire('touchmove',[touch(3,165,275)]);
fire('touchend',[touch(3,165,275)]);
assert(transforms.length>before,'single finger pans after a pinch');
assert.equal(navigation.length,0,'pan while zoomed must not navigate');
// Reset zoom in the same state object used by installed handlers.
ctx.imageViewerZoom=1;
fire('touchstart',[touch(4,320,220)]);
fire('touchmove',[touch(4,120,220)]);
fire('touchend',[touch(4,120,220)]);
assert.deepEqual(navigation,[6],'horizontal swipe at 100% switches to next photo');
fire('touchstart',[touch(5,210,200)]);
fire('touchmove',[touch(5,210,315)]);
fire('touchend',[touch(5,210,315)]);
assert.equal(closed.length,1,'swipe down closes viewer');
// While not pinching, a double-tap on image toggles zoom.
now=2000;
fire('touchstart',[touch(6,150,200)]);
fire('touchend',[touch(6,150,200)]);
now=2170;
fire('touchstart',[touch(7,150,200)]);
fire('touchend',[touch(7,150,200)]);
assert.equal(ctx.imageViewerZoom,2.5,'double tap zooms to 250%');
now=2500;
fire('touchstart',[touch(8,150,200)]);
fire('touchend',[touch(8,150,200)]);
now=2650;
fire('touchstart',[touch(9,150,200)]);
fire('touchend',[touch(9,150,200)]);
assert.equal(ctx.imageViewerZoom,1,'another double tap resets zoom');
const oldNav=navigation.length,oldClose=closed.length;
fire('touchstart',[touch(10,150,200)]);
fire('touchcancel',[touch(10,170,250)]);
assert.equal(navigation.length,oldNav);
assert.equal(closed.length,oldClose);
let prevent=false;
listeners.get('touchstart').callback({
  target:controls,changedTouches:[touch(11,150,200)],cancelable:true,
  preventDefault(){prevent=true;}
});
assert.equal(prevent,false,'control buttons retain their native click');
// Native iOS GestureEvents are a fallback when WebKit cancels TouchEvents.
clock=5000;
let preventedGesture=false;
function gesture(type,scale){
  const listener=listeners.get(type);
  assert(listener&&listener.options.passive===false);
  listener.callback({
    target:image,scale,clientX:130,clientY:250,cancelable:true,
    preventDefault(){preventedGesture=true;}
  });
}
ctx.imageViewerZoom=1;
gesture('gesturestart',1);
gesture('gesturechange',3);
assert.equal(ctx.imageViewerZoom,3,'WebKit native gesturechange must zoom image');
gesture('gestureend',3);
assert.equal(ctx.imageViewerPinchRendering,false,'gestureend re-renders full-res pixels');
assert(preventedGesture,'native page pinch must be blocked inside the viewer');
// Dedicated +/- control is INSIDE main, not the non-interactive header.
assert.match(app,/head\.append\(heading,close\);/);
assert.match(app,/main\.append\(image,prev,next,meta,zoomControls\);/);
assert.match(orientation,/\.image-review \.image-review-main>\.image-review-zoom-controls/);
console.log('IMG-342 iOS pinch/pan/swipe/double-tap, cancellation and visible zoom controls PASS');
