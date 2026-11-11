'use strict';
// P1-288: retry only the account-scoped, already-persisted media outbox item.
// No real RPC, Storage upload, send, polling or production data are used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sync=fs.readFileSync('v21-sync-engine.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const css=fs.readFileSync('chat-connection-status.css','utf8');
const statusSource=fs.readFileSync('chat-connection-status.js','utf8');

const begin=sync.indexOf('async function retryFailedMedia(');
const end=sync.indexOf('function unreadSnapshot(',begin);
assert(begin>0&&end>begin);
let accountId='A',appSessionId='SA',contactId='CONTACT',conversationId='CONV',connected=true;
const client={};
const asset={kind:'image',asset_id:'asset-1',storage_key:'A/CONV/asset-1',uploaded:true};
let row={
 kind:'media',client_id:'media-client-1',account_id:'A',
 contact_id:'CONTACT',conversation_id:'CONV',body:'ảnh bill',
 failed:true,retryable:true,attempts:4,next_retry_at:Date.now()+20000,
 assets:[asset]
};
let hasBlob=true,updateCalls=[],applyCalls=[],wakeReasons=[];
const cache={
 async listOutboxForContact(owner,target){
  assert.equal(owner,accountId);
  assert.equal(target,'CONTACT');
  return [row];
 },
 async updateOutbox(owner,next){
  updateCalls.push({owner,id:next.client_id,failed:next.failed,next_retry_at:next.next_retry_at});
  row=next;
  return true;
 }
};
const context=vm.createContext({
 captureFlushContext:()=>({accountId,appSessionId,client}),
 syncOwnerContextCurrent:x=>x.accountId===accountId&&x.appSessionId===appSessionId&&x.client===client,
 online:()=>connected,
 outboxFlushFlight:null,
 currentContactId:contactId,currentConversationId:conversationId,
 cache:()=>cache,
 media:()=>({get:async()=>hasBlob?{blob:new Blob(['image-data'],{type:'image/png'})}:null}),
 Blob,
 mediaAssetsFromOutbox:x=>x.assets||[],
 messages:()=>({apply:(...args)=>applyCalls.push(args)}),
 outboxAsLocal:x=>({...x,_local_state:x.failed?'failed':'pending'}),
 wake:async info=>{wakeReasons.push(info.reason);return true}
});
vm.runInContext(sync.slice(begin,end)+'\nglobalThis.retry=retryFailedMedia;',context);
const scope=()=>({
 clientId:'media-client-1',contactId:'CONTACT',conversationId:'CONV',
 accountId:'A',appSessionId:'SA'
});
async function test(){
 connected=false;
 assert.equal((await context.retry(scope())).reason,'offline');
 assert.equal(updateCalls.length,0);
 connected=true;
 assert.equal((await context.retry({...scope(),accountId:'B'})).reason,'context_changed');
 assert.equal(updateCalls.length,0);
 row.retryable=false;
 assert.equal((await context.retry(scope())).reason,'not_retryable');
 row.retryable=true;
 hasBlob=false;
 row.assets[0].uploaded=false;
 assert.equal((await context.retry(scope())).reason,'asset_unavailable',
   'missing unuploaded bytes must never be treated as a successful upload');
 assert.equal(updateCalls.length,0);
 row.assets[0].uploaded=true;
 hasBlob=true;
 context.outboxFlushFlight={context:{accountId:'A',appSessionId:'SA',client}};
 assert.equal((await context.retry(scope())).reason,'busy');
 context.outboxFlushFlight=null;
 assert.deepEqual(
  {...(await context.retry(scope()))},
  {ok:true,reason:'queued'}
 );
 assert.equal(updateCalls.length,1);
 assert.deepEqual(updateCalls[0],{owner:'A',id:'media-client-1',failed:false,next_retry_at:0});
 assert.equal(row.client_id,'media-client-1','retry MUST retain original idempotency key');
 assert.equal(row.attempts,4,'retry does not erase failure evidence');
 assert.equal(row.assets[0].asset_id,'asset-1');
 assert.equal(row.assets[0].storage_key,'A/CONV/asset-1');
 assert.equal(row.assets[0].uploaded,true,'already uploaded bytes must not upload again');
 assert.equal(applyCalls.length,1);
 assert.equal(wakeReasons.length,1);
 assert.equal(wakeReasons[0],'manual-media-retry');
 assert.equal((await context.retry(scope())).reason,'not_failed');
 assert.equal(updateCalls.length,1,'repeat tap may not enqueue duplicate');

 // No stale session may change someone else's outbox.
 row.failed=true;
 context.currentContactId='OTHER';
 assert.equal((await context.retry(scope())).reason,'context_changed');
 context.currentContactId='CONTACT';
 context.currentConversationId='OTHER-CONV';
 assert.equal((await context.retry(scope())).reason,'context_changed');
 context.currentConversationId='CONV';
 assert.equal(updateCalls.length,1);
 row.kind='text';
 assert.equal((await context.retry(scope())).reason,'not_media');
 row.kind='media';

 // Local pending/failed UI is an in-bubble action; text-only messages
 // remain free of retry buttons and all outcomes remain unconfirmed until ACK.
 const uiStart=app.indexOf('function syncMessageDeliveryState(');
 const uiEnd=app.indexOf('function messageDateKey(',uiStart);
 assert(uiStart>0&&uiEnd>uiStart);
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.isConnected=true;this._text='';this.className='';}
  get textContent(){return this._text;}
  set textContent(v){this._text=String(v);this.children=[];}
  appendChild(node){this.children.push(node);return node;}
  setAttribute(k,v){this.attributes[k]=String(v)}
  querySelector(sel){return sel===':scope > .message-delivery-state'
   ?this.children.find(x=>x.className==='message-delivery-state')||null:null;}
  addEventListener(k,fn){this.events[k]=fn}
  remove(){this.isConnected=false}
 }
 const auth={account:{id:'A'},appSessionId:'SA'};
 const session={currentContactId:'CONTACT',currentConversationId:'CONV'};
 let sentArgs=null;
 const ui=vm.createContext({
  document:{createElement:tag=>new Element(tag)},
  window:{
   V21AuthSessionStore:{snapshot:()=>auth},
   V21MessageStore:{snapshot:()=>session},
   V21SyncEngine:{async retryFailedMedia(args){sentArgs=args;return{ok:false,reason:'offline'}}}
  }
 });
 vm.runInContext(app.slice(uiStart,uiEnd)+'\nglobalThis.show=syncMessageDeliveryState;',ui);
 const unit=new Element('div');
 ui.show(unit,{sender:'self',status:'failed',media:{type:'image'},id:'media-client-1',clientId:'media-client-1'});
 assert.equal(unit.children.length,1);
 assert.equal(unit.children[0].children.length,1,'one retry button inside failed media status');
 const button=unit.children[0].children[0];
 assert.equal(button.textContent,'Thử gửi lại');
 await button.events.click({preventDefault(){},stopPropagation(){}});
 assert.equal(sentArgs.clientId,'media-client-1');
 assert.equal(sentArgs.accountId,'A');
 assert.equal(sentArgs.appSessionId,'SA');
 assert.equal(sentArgs.conversationId,'CONV');
 assert.equal(button.disabled,false,'after refused retry, control remains usable');
 const textUnit=new Element('div');
 ui.show(textUnit,{sender:'self',status:'failed',id:'only-text',media:null});
 assert.equal(textUnit.children.length,1);
 assert.equal(textUnit.children[0].children.length,0,'text-only failure has no media re-send');

 // Advisory connection status: no false "delivered" statement, no extra network.
 const netEvents={},docEvents={},badge={textContent:''};
 const holder={hidden:true,dataset:{state:'idle'},querySelector:()=>badge};
 const connection={state:'AUTHENTICATED'};
 const page={route:'chat'};
 const nav={onLine:false};
 vm.runInNewContext(statusSource,{
  window:{
   V21AuthSessionStore:{snapshot:()=>connection},
   ChatAppShell:{snapshot:()=>page},
   addEventListener(name,fn){netEvents[name]=fn}
  },
  document:{
   getElementById:()=>holder,
   addEventListener(name,fn){docEvents[name]=fn}
  },
  navigator:nav
 });
 assert.equal(holder.hidden,false);
 assert.equal(holder.dataset.state,'offline');
 assert.match(badge.textContent,/ngoại tuyến/);
 nav.onLine=true;netEvents.online();
 assert.equal(holder.dataset.state,'reconnecting');
 assert.match(badge.textContent,/đang kiểm tra đồng bộ/);
 docEvents['v21-sync-lifecycle']({detail:{state:'failed'}});
 assert.equal(holder.dataset.state,'unstable');
 docEvents['v21-sync-lifecycle']({detail:{state:'completed'}});
 assert.equal(holder.hidden,true);
 connection.state='GUEST';nav.onLine=false;netEvents.offline();
 assert.equal(holder.hidden,true,'no private status in unauthenticated shell');

 assert(html.includes('id="chatConnectionStatus"'));
 assert(html.includes('data-build-source="chat-connection-status.js"'));
 assert(html.includes('data-build-source="chat-connection-status.css"'));
 assert(css.includes('height:0;')&&css.includes('min-height:44px'));
 assert(sync.includes("new CustomEvent('v21-sync-lifecycle'"));
 assert(sync.includes("retryFailedMedia,forwardMessage"));
 assert(!statusSource.includes('.rpc(')&&!statusSource.includes('fetch('));
 assert(!statusSource.includes('setInterval('));
 console.log('P1-288 durable media retry, auth and blob fences, no duplicate send, offline indicator PASS');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
