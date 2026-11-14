'use strict';
// CHAT-341: pure/local source regression. No real messages, server calls,
// file upload, bank operations, browser or production database changes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('index.source.html','utf8');

// CHAT-345 replaces the bold 360-degree bubble border with subtle text
// breathing and a tiny media pulse. The outbox ACK alone clears the state.
const visual=css.slice(css.indexOf('/* CHAT-345: ChatGPT-like quiet pending feedback.'));
assert(visual.startsWith('/* CHAT-345'));
for(const token of [
 '.message-delivery-state[data-state="sending"]',
 'position:absolute!important;',
 'width:1px!important;',
 'height:1px!important;',
 'clip-path:inset(50%)!important;',
 '.message-unit[data-delivery-state="sending"]>.message-text:not([hidden])',
 'animation:chat-send-text-breathe 2.5s ease-in-out infinite;',
 '@keyframes chat-send-text-breathe{',
 'color:color-mix(in srgb,var(--theme-content-primary,#202124) 72%',
 '.message-unit[data-delivery-state="sending"]>.message-media-shell::after',
 'width:7px;',
 'height:7px;',
 'pointer-events:none;',
 'animation:chat-send-media-breathe 2.5s ease-in-out infinite;',
 '@media(prefers-reduced-motion:reduce)',
 'animation:none!important;'
])assert(visual.includes(token),'missing quiet pending visual '+token);
assert(!visual.includes('conic-gradient('),'no strong spinning border');
assert(!visual.includes('chat-send-border-orbit'),'no old moving border');
assert(!visual.includes('--chat-send-orbit'),'no animated ring property');
assert(!visual.includes('data-delivery-state="finishing"'),'ACK has no lingering finish animation');
assert(visual.includes('position:absolute;')&&visual.includes('z-index:3;'),
 'media dot is outside layout and never shifts the message');

function deliveryFixture(hasText=true){
  const events=[];
  const unit={
    dataset:{},node:null,
    querySelector(s){return s===':scope > .message-delivery-state'?this.node:null;},
    appendChild(node){this.node=node;node.isConnected=true;},
    addEventListener(name){events.push(name);}
  };
  const document={createElement:tag=>{
    assert.equal(tag,'span');
    return {dataset:{},attrs:{},textContent:'',
      setAttribute(k,v){this.attrs[k]=v;},
      remove(){this.isConnected=false;unit.node=null;},
      appendChild(){this.children=(this.children||0)+1;}
    };
  }};
  const window={matchMedia:()=>({matches:false})};
  const begin=source.indexOf('function syncMessageDeliveryState(');
  const end=source.indexOf('function messageDateKey(',begin);
  assert(begin>0&&end>begin,'delivery presentation owner is isolated');
  const ctx=vm.createContext({window,document,Number,String});
  vm.runInContext(source.slice(begin,end),ctx);
  return {unit,events,send:message=>ctx.syncMessageDeliveryState(unit,message)};
}
for(const hasText of [true,false]){
  const fx=deliveryFixture(hasText);
  fx.send({sender:'self',status:'sending',kind:hasText?'text':'image'});
  assert.equal(fx.unit.dataset.deliveryState,'sending');
  assert.equal(fx.unit.node?.textContent,'Đang chờ xác nhận gửi');
  assert.equal(fx.unit.node?.attrs.role,'status');
  assert.equal(fx.events.length,0,'no animation iteration listener or pending layout owner');
  fx.send({sender:'self',status:'sending'});
  assert.equal(fx.unit.dataset.deliveryState,'sending','waiting never silently claims sent');
  fx.send({sender:'self',status:'sent'});
  assert.equal(fx.unit.node,null,'real ACK removes hidden sending label');
  assert.equal(fx.unit.dataset.deliveryState,undefined,'real ACK clears pulse immediately');
  fx.send({sender:'self',status:'sending'});
  assert.equal(fx.unit.dataset.deliveryState,'sending','a later retry can use its own pending pulse');
  fx.send({sender:'self',status:'failed'});
  assert.equal(fx.unit.dataset.deliveryState,'failed','failed state stays actionable');
  assert.equal(fx.unit.node?.textContent,'Chưa gửi thành công');
  fx.send({sender:'remote',status:'sending'});
  assert.equal(fx.unit.dataset.deliveryState,undefined,'incoming message never shows local pending');
}
assert(!source.includes('function finishConfirmedSendCycle('),
 'no hidden completion phase depends on a border animation iteration');
assert(!source.includes('prefersReducedSendMotion'),
 'reduced motion is presentation-only in CSS');

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
console.log('CHAT-341/345: quiet text/media pending paint, real ACK cleanup, no reflow or near-Composer jump PASS');
