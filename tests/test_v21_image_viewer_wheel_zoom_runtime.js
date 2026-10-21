'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8');
const start=app.indexOf("  main.addEventListener('wheel',event=>{");
const marker="  },{passive:false});";
const end=app.indexOf(marker,start);
assert(start>0&&end>start,'image wheel listener missing');
const listener=app.slice(start,end+marker.length);
const handlers=new Map();
const calls=[];
class Element {closest(){return null;}}
const ctx={
  Element,Math,Number,
  imageViewerZoom:1,
  main:{clientHeight:750,addEventListener(type,handler,options){handlers.set(type,{handler,options});}},
  setImageViewerZoom(next,origin){
    assert(origin&&Number.isFinite(origin.clientX)&&Number.isFinite(origin.clientY));
    ctx.imageViewerZoom=Math.max(1,Math.min(5,next));
    calls.push(ctx.imageViewerZoom);
    return true;
  }
};
vm.createContext(ctx);
vm.runInContext(listener,ctx);
const wheel=handlers.get('wheel');
assert(wheel&&wheel.options.passive===false,'wheel must be cancellable');
function send(deltaY,deltaMode=0){
  let blocked=false;
  wheel.handler({target:new Element(),deltaY,deltaMode,clientX:180,clientY:320,
    preventDefault(){blocked=true}});
  assert(blocked,'viewer wheel should prevent page scroll / image selection');
}
send(-100);
assert(ctx.imageViewerZoom>1,'scroll up zooms in from 100%, never switches photos');
send(100);
assert(Math.abs(ctx.imageViewerZoom-1)<.01,'scroll down zooms back out');
send(-3,1);
assert(ctx.imageViewerZoom>1,'line-based mouse wheel zoom works');
assert.equal(calls.length,3,'each wheel gesture adjusts the same photo');
assert(!listener.includes('showImageViewerIndex'),'wheel must not change the photo index');
console.log('Image viewer wheel zoom from 100%, zoom out, line-mode wheel PASS');
