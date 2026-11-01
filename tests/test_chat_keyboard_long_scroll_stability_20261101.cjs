'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// SPEC-CHAT-KEYBOARD-SCROLL-STABILITY-20261101
// Long conversations, multiline Composer, and native iOS keyboard must not
// oscillate two competing scroll reserves or force an already scrolling form
// back to the focused field on every visualViewport scroll event.
// MUST-STAY: one ScrollRoot writer, user-away anchor, IME, media and realtime.
const app=fs.readFileSync('app.js','utf8');
const policy=fs.readFileSync('shell-form-viewport-policy.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');

const adapterStart=app.indexOf('const KeyboardInsetAdapter={');
const adapterEnd=app.indexOf('};',adapterStart);
assert(adapterStart>0&&adapterEnd>adapterStart);
const adapter=app.slice(adapterStart,adapterEnd+2);
assert.match(adapter,/composerPlacementFrame:0/);
assert.match(adapter,/if\(this\.composerPlacementFrame\)return/);
assert.match(adapter,/cancelAnimationFrame\(this\.composerPlacementFrame\)/);
assert.match(adapter,/document\.activeElement!==editor/);
assert.match(adapter,/publishComposerHeight\(\)/);
// The sole writer now owns the HEIGHT + OCCLUSION formula; the placement
// code may not overwrite it with bare composer height.
assert.doesNotMatch(adapter,/scrollRoot\.style\.setProperty\(\s*'--composer-flow-reserve'/);
const heightStart=app.indexOf('function publishComposerHeight(){');
const heightEnd=app.indexOf('const composerObserver=',heightStart);
const heightOwner=app.slice(heightStart,heightEnd);
assert.match(heightOwner,/const totalReserve=safeHeight\+keyboardReserve/);
assert.match(heightOwner,/scrollRoot\.style\.setProperty\('--composer-flow-reserve',reserveValue\)/);
assert.match(heightOwner,/if\(previousReserve!==reserveValue\)/);
assert.match(app,/const focused=document\.activeElement;[\s\S]{0,185}focused!==editor\)return false/);
assert.match(html,/#stageLayout\[data-keyboard-open="true"\] #scrollRoot\{/);
assert.match(html,/overflow-anchor:none/);

// Use the actual owner methods with a controlled layout to prove that the
// reserve no longer flips between 60px and (60+360)px across resize, scroll
// and pending frame corrections.
class Style{
  constructor(){this.values=new Map();this.writes=[]}
  setProperty(k,v){this.values.set(k,String(v));this.writes.push([k,String(v)])}
  removeProperty(k){this.values.delete(k)}
  getPropertyValue(k){return this.values.get(k)||''}
}
const editor={};
const scrollRoot={dataset:{},style:new Style()};
const stageLayout={dataset:{},style:new Style()};
const bottomContainer={getBoundingClientRect:()=>({height:60})};
const svhProbe={getBoundingClientRect:()=>({height:720})};
const vv={height:360,offsetTop:0};
const tasks=new Map();let serial=0;
const requestAnimationFrame=fn=>{tasks.set(++serial,fn);return serial};
const cancelAnimationFrame=id=>tasks.delete(id);
let heightPublishes=0;
const env={
  editor,scrollRoot,stageLayout,bottomContainer,svhProbe,vv,
  window:{navigator:{maxTouchPoints:5,userAgent:'iPhone'},matchMedia:()=>({matches:true})},
  document:{activeElement:editor},innerHeight:720,RuntimeProfile:{keyboardVisualGapPx:0},
  Math,Number,String,Boolean,
  requestAnimationFrame,cancelAnimationFrame,
  publishComposerHeight(){
    heightPublishes++;
    const h=Math.ceil(bottomContainer.getBoundingClientRect().height);
    const total=h+(env.KeyboardInsetAdapter.open?env.KeyboardInsetAdapter.current:0);
    const before=scrollRoot.style.getPropertyValue('--composer-flow-reserve');
    if(before!==total+'px')scrollRoot.style.setProperty('--composer-flow-reserve',total+'px');
  }
};
vm.createContext(env);
vm.runInContext(adapter,env);
const adapterRuntime=env.KeyboardInsetAdapter;
adapterRuntime.restingVisualHeight=720;
adapterRuntime.layoutBottom=720;
adapterRuntime.update();
assert.equal(scrollRoot.style.getPropertyValue('--composer-flow-reserve'),'420px');
for(let i=0;i<12;i++)adapterRuntime.update();
assert.equal(tasks.size,1,'repeated viewport signals must coalesce composer correction to one frame');
assert.equal(scrollRoot.style.writes.filter(([name])=>name==='--composer-flow-reserve').length,1);
for(const fn of [...tasks.values()])fn();
tasks.clear();
assert.equal(scrollRoot.style.getPropertyValue('--composer-flow-reserve'),'420px');
assert.equal(scrollRoot.style.writes.filter(([name])=>name==='--composer-flow-reserve').length,1);
assert(heightPublishes>=1);
env.document.activeElement=null;
adapterRuntime.update();
assert.equal(scrollRoot.style.getPropertyValue('--composer-flow-reserve'),'60px');
assert.equal(stageLayout.dataset.composerPlacement,'sticky');
assert.equal(tasks.size,0,'closed keyboard must cancel stale geometry frame');

// Actual form policy should avoid a redundant scroll-to-focused-field when
// the viewport scrolls but its visible geometry and focused field did not move.
class PaneStyle{
  constructor(){this.props=new Map()}
  setProperty(k,v){this.props.set(k,v)}
  removeProperty(k){this.props.delete(k)}
  getPropertyValue(k){return this.props.get(k)||''}
}
function node(cls,parent=null,field=false){
  return{
    className:cls,parentElement:parent,style:new PaneStyle(),dataset:{},scrollTop:0,
    getBoundingClientRect(){return this.rect||{top:0,bottom:360}},
    matches(sel){return field&&sel==='input,textarea,select,[contenteditable="true"]'},
    closest(sel){
      let n=this;
      while(n){
        if(sel.split(',').some(part=>part.trim().startsWith('.')&&part.trim().slice(1)===n.className))return n;
        n=n.parentElement;
      }
      return null;
    }
  };
}
const modal=node('zalo-account-modal');
const card=node('zalo-account-card',modal);
const prefs=node('zalo-account-preferences',card);
prefs.rect={top:50,bottom:340};prefs.scrollHeight=880;prefs.clientHeight=290;
const field=node('',prefs,true);field.rect={top:350,bottom:410};
const listeners={};const vvEvents={};
let focused=field;
const visual={height:360,offsetTop:0,addEventListener:(name,fn)=>vvEvents[name]=fn};
const frames=[];
const clientWindow={
  innerHeight:720,visualViewport:visual,navigator:{maxTouchPoints:5,userAgent:'iPhone'},
  matchMedia:()=>({matches:true}),addEventListener(){}
};
const client={window:clientWindow,document:{
  get activeElement(){return focused},
  addEventListener:(name,fn)=>listeners[name]=fn
},navigator:clientWindow.navigator,requestAnimationFrame:fn=>{frames.push(fn);return frames.length},Math,Number,Boolean,String,Set,Object,Array,console};
vm.runInNewContext(policy,client);
const flush=()=>{let attempts=0;while(frames.length){assert(++attempts<12,'animation frames must settle');frames.splice(0).forEach(fn=>fn());}};
listeners.focusin({target:field});flush();
assert(prefs.scrollTop>0,'initial obscured preference field must become visible');
const first=prefs.scrollTop;
for(let i=0;i<20;i++){vvEvents.scroll();flush();}
assert.equal(prefs.scrollTop,first,'unchanged keyboard geometry must not re-scroll the focused field');
visual.height=300;vvEvents.resize();flush();
assert(prefs.scrollTop>=first,'real keyboard resizing may legitimately reveal a field');
const after=prefs.scrollTop;
for(let i=0;i<20;i++){vvEvents.scroll();flush();}
assert.equal(prefs.scrollTop,after,'no feedback loop after geometry settles');
console.log('CHAT long-scroll + iOS keyboard single-reserve + scoped focus stability PASS');
