'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const source=readFileSync(join(__dirname,'..','v21-realtime-session.js'),'utf8');
const instrumented=source.replace('window.V21RealtimeSession={',
  "window.__presenceTest={setChannel(next){channel=next;channelState='SUBSCRIBED';}};\\nwindow.V21RealtimeSession={");
assert.notEqual(source,instrumented,'test requires actual Realtime session source');
let route='chat',conversationId='conv-one';
const ctx={
  console,Date,JSON,Math,Number,String,Array,Object,Promise,Map,Set,
  navigator:{onLine:true},
  document:{hidden:false,addEventListener(){},dispatchEvent(){return true;}},
  CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
  queueMicrotask(){},clearTimeout(){},setTimeout(){return 1;},
  addEventListener(){},
  V21AuthSessionStore:{snapshot(){return{state:'AUTHENTICATED',appSessionId:'session-one',account:{id:'account-one'}};}},
  V21SyncEngine:{snapshot(){return{currentConversationId:conversationId};}},
  ChatAppShell:{snapshot(){return{route};}}
};
ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(instrumented,ctx);
let calls=0;
const channel={async track(){calls++;return 'ok';}};
(async()=>{
  ctx.__presenceTest.setChannel(channel);
  assert.equal(await ctx.V21RealtimeSession.publishPresence(),true);
  assert.equal(await ctx.V21RealtimeSession.publishPresence(),false,'unchanged presence should dedupe');
  assert.equal(calls,1,'two identical Presence events cannot consume two Realtime tracks');
  route='contacts';
  assert.equal(await ctx.V21RealtimeSession.publishPresence(),true,'route change is meaningful');
  assert.equal(calls,2);
  conversationId='conv-two';
  route='chat';
  assert.equal(await ctx.V21RealtimeSession.publishPresence(),true,'active conversation change is meaningful');
  assert.equal(calls,3);
  const reconnect={async track(){calls++;return 'ok';}};
  ctx.__presenceTest.setChannel(reconnect);
  assert.equal(await ctx.V21RealtimeSession.publishPresence(),true,'new channel must publish even if state unchanged');
  assert.equal(calls,4);
  let failedCalls=0;
  ctx.__presenceTest.setChannel({async track(){failedCalls++;return failedCalls===1?'error':'ok';}});
  assert.equal(await ctx.V21RealtimeSession.publishPresence(),false,'failed track is not success');
  assert.equal(await ctx.V21RealtimeSession.publishPresence(),true,'failed track may retry');
  assert.equal(failedCalls,2);
  console.log('CHAT Presence semantic dedup, route change, reconnect and retry PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
