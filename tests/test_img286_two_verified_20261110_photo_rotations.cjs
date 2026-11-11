'use strict';
// IMG-286: two optically verified sideways photo thumbnails of one selected
// Chat conversation should be horizontally readable by default on Web+PWA.
// Never modify the underlying media Blob, Postgres, sender or gallery source.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const orientation=fs.readFileSync(path.join(__dirname,'..','chat-image-orientation.js'),'utf8');
const library=fs.readFileSync(path.join(__dirname,'..','customer-photo-library.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.source.html'),'utf8');
const viewer=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const sourceStart=orientation.indexOf("const STORAGE_PREFIX='v21-chat-image-rotation:';");
const sourceEnd=orientation.indexOf('function installStyle(){',sourceStart);
assert(sourceStart>0&&sourceEnd>sourceStart,'shared rotation owner exists');
const source=orientation.slice(sourceStart,sourceEnd);
assert.match(source,/VERIFIED_PHOTO_ROTATION_DEFAULTS=Object\.freeze/);
const fixed=source.match(/'[0-9a-f]{8}-[0-9a-f-]{27}':270/g)||[];
assert.equal(fixed.length,2,'never bulk-rotate other customers or images');
const assets=[
 '46b15aa8-d687-481d-be95-a97893e87eba', // Excel, latest in the group
 'd821a746-002a-48e1-a1da-3706cdca8295'  // three numeric rows
];
for(const id of assets){
 assert(source.includes("'"+id+"':270"),'manual left turn applies to exactly '+id);
}
const store=new Map();
const localStorage={getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>{store.set(k,String(v));}};
const context=vm.createContext({localStorage,Number,Math,Object,String});
vm.runInContext(source,context);
const read=id=>vm.runInContext('readRotation',context)(id);
const write=(id,deg)=>vm.runInContext('writeRotation',context)(id,deg);
for(const id of assets){
 assert.equal(read(id),270,'verified sideways photo gets left 90° when no local preference');
}
assert.equal(read('d38e8ab3-1a8f-4bf2-9e7d-0cd07adb9123'),0,'all unrelated photos unchanged');
write(assets[0],0);
assert.equal(read(assets[0]),0,'an explicit manual choice on that device still wins');
assert.equal(read(assets[1]),270,'editing one photo cannot rotate the other');
write(assets[1],90);
assert.equal(read(assets[1]),90,'manual clockwise correction remains possible');
store.clear();
assert.equal(read(assets[0]),270,'Web and new PWA have the same baseline without localStorage');
context.localStorage={getItem(){throw Error('private storage disabled')}};
assert.equal(read(assets[0]),270,'verified fallback works when localStorage access fails');

const galleryStart=library.indexOf('function applyPhotoTileRotation(');
const galleryEnd=library.indexOf('async function hydrate(',galleryStart);
assert(galleryStart>0&&galleryEnd>galleryStart,'on-demand photo gallery owner exists');
const scope=library.slice(galleryStart,galleryEnd);
const img={dataset:{},style:{transform:'',transformOrigin:''}};
const tile={dataset:{},querySelector:q=>q==='img'?img:null};
const win={V21ImageOrientation:{readRotation:id=>assets.includes(id)?270:0}};
const ctx=vm.createContext({window:win,Number,String});
vm.runInContext(scope,ctx);
function render(id,width,height){
 const item={id,width,height};
 vm.runInContext('applyPhotoTileRotation',ctx)(tile,item);
}
render(assets[0],864,1920);
assert.equal(img.style.transform,'rotate(270deg)');
assert.equal(tile.dataset.rotated,'true');
assert.equal(tile.dataset.fit,'contain','sideways screenshot cannot be cropped inside square gallery');
render(assets[1],864,1920);
assert.equal(img.style.transform,'rotate(270deg)');
render('unrelated',900,700);
assert.equal(img.style.transform,'','normal photos remain upright');
assert.equal(tile.dataset.rotated,'false');
assert.equal(tile.dataset.fit,undefined,'normal landscape photos keep normal crop');
assert.match(library,/document\.addEventListener\('v21-image-rotation-changed'/);
assert.match(library,/item\?\.id===assetId\)applyPhotoTileRotation\(button,item\)/);
assert.match(orientation,/document\.dispatchEvent\(new CustomEvent\('v21-image-rotation-changed'/);
assert.match(orientation,/orientationWindow\.V21ImageOrientation=Object\.freeze\(\{applyTileRotation,readRotation\}\)/);
const beforeLibrary=html.indexOf('chat-image-orientation.js');
const afterLibrary=html.indexOf('customer-photo-library.js');
assert(beforeLibrary>0&&afterLibrary>beforeLibrary,'gallery receives orientation API before rendering');
assert.match(viewer,/const raw=Number\(imageViewerImage\?\.dataset\?\.chatImageRotation\)\|\|0/);
assert.match(orientation,/img\.dataset\.chatImageRotation=String\(rotation\)/);
assert(!scope.includes('ensureMediaRemote')&&!scope.includes('storage.download'),
 'thumbnail rotation cannot cause additional media requests');
console.log('IMG-286 exact two 22:26 sideways photos: default left 90, cross-device fallback, per-device override, viewer+gallery PASS');
