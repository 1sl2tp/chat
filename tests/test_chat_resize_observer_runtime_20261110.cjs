'use strict';
// Regression: browser ResizeObserver delivery diagnostics are not app crashes;
// no ResizeObserver callback mutates layout during its own delivery turn.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

const start=source.indexOf('function runtimeErrorMessage(error){');
const end=source.indexOf('\nconst mobile=',start);
assert(start>=0&&end>start,'runtime error controller exists');
const classes=new Set(['hidden']);
const runtimeError={textContent:'',classList:{
  contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)
}};
const events={};
let errors=0,warnings=0;
const errorContext=vm.createContext({
  runtimeError,modeLabel:{textContent:''},viewport:{mode:'FOLLOW_TAIL'},
  console:{error(){errors++;},warn(){warnings++;}},
  location:{href:'https://chat.taphoa.xyz/',origin:'https://chat.taphoa.xyz',protocol:'https:'},
  URL,window:{addEventListener(k,fn){events[k]=fn;}}
});
vm.runInContext(source.slice(start,end),errorContext);
const boot=vm.runInContext('AppBootController',errorContext);
for(const message of [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded'
]){
  events.error({message,filename:'',error:null});
}
assert.equal(boot.phase,'BOOT','browser warning must not mark app ERROR');
assert.equal(classes.has('hidden'),true,'browser warning never paints red banner');
assert.equal(errors,0);
assert.equal(warnings,2);
events.error({
  message:'TypeError: first-party bug',
  filename:'https://chat.taphoa.xyz/app.js',
  error:new Error('first-party bug')
});
assert.equal(boot.phase,'ERROR','real application failure remains reported');
assert.equal(classes.has('hidden'),false);

class FakeResizeObserver{
  constructor(callback){this.callback=callback;FakeResizeObserver.instances.push(this);}
  observe(){}
}
FakeResizeObserver.instances=[];
let frames=[],composerPublishes=0,messagePublishes=0;
const schedule=fn=>{frames.push(fn);return frames.length;};
const flush=()=>{const current=frames;frames=[];current.forEach(fn=>fn());};
const blockStart=source.indexOf('let composerObserverFrame=0;');
const blockEnd=source.indexOf('/* =========================================================\n   VIEWPORT / WINDOWING',blockStart);
assert(blockStart>0&&blockEnd>blockStart,'composer and message resize owners exist');
vm.runInNewContext(source.slice(blockStart,blockEnd),{
  ResizeObserver:FakeResizeObserver,requestAnimationFrame:schedule,
  bottomContainer:{isConnected:true},messageWindow:{isConnected:true},
  publishComposerHeight(){composerPublishes++;},
  publishViewportGeometryChange(){messagePublishes++;}
});
assert.equal(FakeResizeObserver.instances.length,2);
for(let i=0;i<8;i++){
  FakeResizeObserver.instances[0].callback([]);
  FakeResizeObserver.instances[1].callback([]);
}
assert.equal(composerPublishes,0,'composer cannot write layout inside observer');
assert.equal(messagePublishes,0,'message window cannot publish inside observer');
assert.equal(frames.length,2,'burst coalesces to one frame per owner');
flush();
assert.equal(composerPublishes,1);
assert.equal(messagePublishes,1);
FakeResizeObserver.instances[0].callback([]);
flush();
assert.equal(composerPublishes,2,'next resize delivery remains functional');

FakeResizeObserver.instances=[];
frames=[];
let widthWrites=[],growCalls=0;
const editorStart=source.indexOf('let composerMeasureFrame=0;');
const editorEnd=source.indexOf('composerMeasureObserver?.observe(editor);',editorStart);
assert(editorStart>0&&editorEnd>editorStart,'editor resize owner exists');
vm.runInNewContext(source.slice(editorStart,editorEnd+'composerMeasureObserver?.observe(editor);'.length),{
  ResizeObserver:FakeResizeObserver,requestAnimationFrame:schedule,
  editor:{isConnected:true,getBoundingClientRect(){return{width:320};}},
  syncMeasureStyle({widthPx}){widthWrites.push(widthPx);return true;},
  autoGrow(){growCalls++;}
});
const editorResize=FakeResizeObserver.instances[0];
editorResize.callback([{borderBoxSize:[{inlineSize:300}]}]);
editorResize.callback([{borderBoxSize:[{inlineSize:340}]}]);
assert.equal(widthWrites.length,0,'editor cannot write mirror styles inside observer');
assert.equal(growCalls,0,'editor cannot grow inside observer');
assert.equal(frames.length,1,'editor width burst coalesces');
flush();
assert.deepEqual(widthWrites,[340],'latest width wins');
assert.equal(growCalls,1);
console.log('CHAT ResizeObserver three deferred geometry owners + real runtime error visibility PASS');
