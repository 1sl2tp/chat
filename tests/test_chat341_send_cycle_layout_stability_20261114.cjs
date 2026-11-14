'use strict';
// CHAT-341: pure/local source regression. No real messages, server calls,
// file upload, bank operations, browser or production database changes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('index.source.html','utf8');

// Pending status must never take up a new line next to Composer, and a cycle
// fills the entire 360-degree edge rather than rotating a partial arc forever.
const visual=css.slice(css.indexOf('/* CHAT-341: a complete 360-degree'));
assert(visual.startsWith('/* CHAT-341'));
const pending=css.slice(css.indexOf('.message-delivery-state[data-state="sending"]'),
 css.indexOf('/* CHAT-341: a complete 360-degree'));
assert(pending.includes('.message-delivery-state[data-state="sending"]'));
assert(pending.includes('position:absolute!important;'));
assert(visual.includes('@property --chat-send-orbit{'));
assert(visual.includes('syntax:"<angle>";'));
assert(visual.includes('.message-unit:is([data-delivery-state="sending"],[data-delivery-state="finishing"])'));
assert(visual.includes('from -90deg'));
assert(visual.includes('#75b4fa var(--chat-send-orbit)'));
assert(visual.includes('transparent var(--chat-send-orbit) 360deg'));
assert(visual.includes('animation:chat-send-border-orbit 1.45s linear infinite'));
assert(visual.includes('to{--chat-send-orbit:360deg}'));
assert(!visual.includes('transparent 172deg'),'old moving partial-arc spinner removed');
assert(visual.includes('@media(prefers-reduced-motion:reduce)'));

function deliveryFixture(reduced=false,hasText=true){
  const surface={kind:hasText?'text':'media'};
  const events={};
  const unit={
    dataset:{},node:null,
    querySelector(s){
      if(s===':scope > .message-delivery-state')return this.node;
      if(s===':scope > .message-text:not([hidden])')return hasText?surface:null;
      if(s===':scope > .message-media-shell')return hasText?null:surface;
      return null;
    },
    appendChild(node){this.node=node;node.isConnected=true;},
    addEventListener(name,fn){events[name]=fn;}
  };
  const document={createElement:tag=>{
    assert.equal(tag,'span');
    return {dataset:{},attrs:{},textContent:'',
      setAttribute(k,v){this.attrs[k]=v;},
      remove(){this.isConnected=false;unit.node=null;},
      appendChild(){this.children=(this.children||0)+1;}
    };
  }};
  const window={matchMedia:()=>({matches:reduced})};
  const begin=source.indexOf('function finishConfirmedSendCycle(');
  const end=source.indexOf('function messageDateKey(',begin);
  assert(begin>0&&end>begin,'delivery presentation helpers are isolated');
  const ctx=vm.createContext({window,document,Number,String});
  vm.runInContext(source.slice(begin,end),ctx);
  return {unit,surface,events,send:message=>ctx.syncMessageDeliveryState(unit,message),
    finish:event=>ctx.finishConfirmedSendCycle(unit,event)};
}
for(const hasText of [true,false]){
  const fx=deliveryFixture(false,hasText);
  fx.send({sender:'self',status:'sending',kind:hasText?'text':'image'});
  assert.equal(fx.unit.dataset.deliveryState,'sending');
  assert.equal(fx.unit.node?.textContent,'Đang chờ xác nhận gửi');
  assert.equal(typeof fx.events.animationiteration,'function');
  fx.finish({animationName:'chat-send-border-orbit',target:fx.surface});
  assert.equal(fx.unit.dataset.deliveryState,'sending','one full loop NEVER claims sent without ACK');
  fx.send({sender:'self',status:'sent'});
  assert.equal(fx.unit.node,null,'server ACK removes pending label immediately without a row gap');
  assert.equal(fx.unit.dataset.deliveryState,'finishing','finish pending last sweep instead of cutting it off');
  fx.events.animationiteration({animationName:'other-effect',target:fx.surface});
  assert.equal(fx.unit.dataset.deliveryState,'finishing');
  fx.events.animationiteration({animationName:'chat-send-border-orbit',target:fx.surface});
  assert.equal(fx.unit.dataset.deliveryState,undefined,'full sweep ends visually at the iteration boundary');
  fx.send({sender:'self',status:'sending'});
  assert.equal(fx.unit.dataset.deliveryState,'sending','a later retry can show its own pending cycles');
  fx.send({sender:'self',status:'failed'});
  assert.equal(fx.unit.dataset.deliveryState,'failed','failures stop the pending animation');
  assert.equal(fx.unit.node?.textContent,'Chưa gửi thành công');
}
const reduced=deliveryFixture(true);
reduced.send({sender:'self',status:'sending'});
reduced.send({sender:'self',status:'sent'});
assert.equal(reduced.unit.dataset.deliveryState,undefined,'reduced motion does not leave a permanent border');

// Compare presentation signatures: text/media DOM is reused on ACK when
// content/attachment geometry is unchanged, even if time value is updated.
const beginSig=source.indexOf('function onlyMessageDeliveryAndClockChanged(');
const endSig=source.indexOf('function setImageTileOverlay(',beginSig);
assert(beginSig>0&&endSig>beginSig);
const sctx=vm.createContext({JSON,String,
 messageVisualSignature:m=>JSON.stringify([
  m.sender,m.kind,m.text,m.status,m.important||false,m.reply||'',
  m.media||'',m.day||'today',m.separator||'',m.time
 ])});
vm.runInContext(source.slice(beginSig,endSig),sctx);
const previous={sender:'self',kind:'text',text:'Chào',status:'sending',media:'',time:100};
assert.equal(sctx.onlyMessageDeliveryAndClockChanged(previous,{...previous,status:'sent',time:101}),true);
assert.equal(sctx.onlyMessageDeliveryAndClockChanged(previous,{...previous,status:'sent',text:'Khác'}),false);
assert.equal(sctx.onlyMessageDeliveryAndClockChanged(previous,{...previous,status:'sent',media:'image:x'}),false);
assert.equal(sctx.onlyMessageDeliveryAndClockChanged(previous,{...previous,status:'sent',day:'tomorrow'}),false);
assert.equal(sctx.onlyMessageDeliveryAndClockChanged(previous,{...previous,time:101}),false);
assert(source.includes('const onlyAck=onlyMessageDeliveryAndClockChanged(oldMessage,message);'));
assert(source.includes('if(onlyAck){'));
assert(source.includes('syncMessageTimeNode(unit,message);'));
assert(source.includes('syncMessageDeliveryState(unit,message);'));
assert(source.includes("reason==='reconcile-new-message'||reason==='own-send'"),
 'own send reconciles tail before next paint');

// Preserve previously painted same-asset image dimensions when server metadata
// omits width/height, but allow a NEW image to use its own aspect ratio.
const beginImage=source.indexOf('function imageAspectRatio(');
const endImage=source.indexOf('function messageTimestampMs(',beginImage);
assert(beginImage>0&&endImage>beginImage);
const ictx=vm.createContext({Number,String,Math,window:{}});
vm.runInContext(source.slice(beginImage,endImage),ictx);
function tile(assetId){
 const box={dataset:{mediaAssetId:assetId},style:{setProperty(k,v){this[k]=v;}},
  isConnected:false,querySelector(){return null;},closest(){return null;}};
 return box;
}
for(const dims of [[1200,400],[400,800],[800,800]]){
 const wrap=tile('same-image');
 ictx.applySingleImagePresentation(wrap,{type:'image',assetId:'same-image',width:dims[0],height:dims[1]});
 const before={width:wrap.style.width,ratio:wrap.style.aspectRatio};
 ictx.applySingleImagePresentation(wrap,{type:'image',assetId:'same-image',width:null,height:null});
 assert.equal(wrap.style.width,before.width,'ACK with missing metadata retains painted media width');
 assert.equal(wrap.style.aspectRatio,before.ratio,'ACK with missing metadata retains painted media height');
}
const changed=tile('old-image');
ictx.applySingleImagePresentation(changed,{type:'image',assetId:'old-image',width:400,height:800});
ictx.applySingleImagePresentation(changed,{type:'image',assetId:'different-image'});
assert.equal(Number(changed.style.aspectRatio),1.5,'different image does not inherit stale aspect ratio');
assert(source.includes('const stableRatio=naturalRatio>0?naturalRatio:'),
 'single image shell also retains same-asset image geometry');
console.log('CHAT-341: full-cycle ACK border, no status-row or media reflow, synchronous own-send tail PASS');
