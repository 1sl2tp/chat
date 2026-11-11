'use strict';
// IMG-281: rotate both image pixels AND bubble geometry, not just a texture
// inside the original tall portrait frame. No private media or uploads.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const orientation=fs.readFileSync(path.join(__dirname,'..','chat-image-orientation.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','index.source.html'),'utf8');
const start=orientation.indexOf('function rotatedImagePresentation(');
const end=orientation.indexOf('function applyAllTileRotations()',start);
assert(start>0&&end>start,'dedicated orientation module owns image frame geometry');
const scope=orientation.slice(start,end);
function make({width=864,height=1920,rotation=90,gallery=false}={}){
  const properties=new Map(),flags=new Map();
  const style={
    transform:'',transformOrigin:'',position:'',left:'',top:'',aspectRatio:'',
    setProperty(n,v,priority=''){properties.set(n,String(v));flags.set(n,priority);},
    removeProperty(n){properties.delete(n);flags.delete(n);},
    get width(){return properties.get('width')||'';},
    set width(v){properties.set('width',v);},
    get height(){return properties.get('height')||'';},
    set height(v){properties.set('height',v);},
  };
  const img={style,dataset:{chatImageRotation:''},naturalWidth:width,naturalHeight:height};
  const tileProps=new Map();
  const tileStyle={
    aspectRatio:'',
    setProperty(n,v){tileProps.set(n,String(v));},
    getPropertyValue(n){return tileProps.get(n)||'';},
  };
  const shellProps=new Map();
  const shell={style:{setProperty(n,v){shellProps.set(n,String(v));},
    getPropertyValue(n){return shellProps.get(n)||'';}}};
  let created=null;
  const tile={
    dataset:{mediaAssetId:'asset-1',imagePresentation:'portrait',
      sourceAspectRatio:String(width/height),galleryTile:String(gallery)},
    style:tileStyle,
    hasAttribute(k){return k==='data-image-presentation';},
    querySelector(q){return q==='img'?img:created;},
    closest(q){return q.includes('.message-media-shell')?shell:null;},
    getBoundingClientRect(){
      const w=parseFloat(tileProps.get('--message-media-width'))||252;
      return {width:w,height:w/Number(tileStyle.aspectRatio||width/height)};
    },
    appendChild(n){created=n;},
  };
  const ctx={
    readRotation:()=>ctx.currentRotation,
    currentRotation:rotation,
    tileAssetId:()=>tile.dataset.mediaAssetId,
    document:{createElement:()=>({
      style:{},dataset:{},setAttribute(){},textContent:'',className:'',type:''})},
    scheduleSync:()=>{ctx.scheduled=(ctx.scheduled||0)+1;},
    Number,Math,String,
  };
  vm.createContext(ctx);
  vm.runInContext(scope,ctx);
  return{ctx,img,tile,shell,flags,properties,
    apply:()=>vm.runInContext('applyTileRotation',ctx)(tile)};
}
const portrait=make();
portrait.apply();
assert.equal(portrait.tile.dataset.imagePresentation,'landscape');
assert.equal(portrait.tile.dataset.chatImageRotation,'90');
assert.equal(portrait.tile.dataset.rotatedMediaWidth,'360');
assert.equal(portrait.tile.style.getPropertyValue('--message-media-width'),'360px');
assert.equal(portrait.shell.style.getPropertyValue('--message-media-width'),'360px');
assert(Math.abs(Number(portrait.tile.style.aspectRatio)-1920/864)<1e-6);
assert.equal(portrait.img.style.width,'162px');
assert.equal(portrait.img.style.height,'360px');
assert.equal(portrait.flags.get('width'),'important');
assert.equal(portrait.flags.get('height'),'important');
assert.match(portrait.img.style.transform,/rotate\(90deg\)/);
portrait.ctx.currentRotation=0;
portrait.apply();
assert.equal(portrait.tile.dataset.imagePresentation,'portrait');
assert.equal(portrait.tile.dataset.rotatedMediaWidth,'252');
assert.equal(portrait.tile.style.getPropertyValue('--message-media-width'),'252px');
assert.equal(portrait.img.style.width,'');
assert.equal(portrait.img.style.height,'');
assert.equal(portrait.img.style.transform,'');
portrait.ctx.currentRotation=270;
portrait.apply();
assert.equal(portrait.tile.dataset.imagePresentation,'landscape');
assert.match(portrait.img.style.transform,/rotate\(270deg\)/);
const wide=make({width:1920,height:1080,rotation:90});
wide.apply();
assert.equal(wide.tile.dataset.imagePresentation,'portrait',
 'rotating a wide photo must switch to a tall bubble');
assert.equal(wide.tile.dataset.rotatedMediaWidth,'260');
assert(Math.abs(Number(wide.tile.style.aspectRatio)-1080/1920)<1e-5);
assert.equal(wide.img.style.width,'462px');
assert.equal(wide.img.style.height,'260px');
const gallery=make({rotation:90,gallery:true});
gallery.apply();
assert.equal(gallery.tile.dataset.imagePresentation,'portrait',
 'album grid remains owned by album geometry, never single-bubble sizing');
assert.equal(gallery.tile.dataset.rotatedMediaWidth,undefined);
assert.match(app,/if\(wrap\.isConnected\)window\.V21ImageOrientation\?\.applyTileRotation\?\.\(wrap\)/);
assert.match(app,/const rotatedWidth=Number\(tile\?\.dataset\.rotatedMediaWidth\)\|\|0/);
assert.match(orientation,/orientationWindow\.V21ImageOrientation=Object\.freeze\(\{applyTileRotation,readRotation\}\)/);
assert.match(orientation,/@type \{Window & typeof globalThis & \{V21ImageOrientation\?:/);
assert.match(orientation,/img\.dataset\.layoutZoomed==='true'/);
assert.match(css,/\.media-image-tile\[data-image-presentation\] > img\{[\s\S]*?width:100%!important/);
assert.match(scope,/setProperty\('width',[^\n]+,'important'\)/,
 'rotation overrides author !important width with important inline pixels');
assert(!scope.includes('storage.download('),'orientation must be purely local and silent');
console.log('IMG-281 two portrait JPEGs 864x1920 rotate into wide bubble; reset, opposite turn, landscape source, album, zoom PASS');
