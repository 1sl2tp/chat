import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIncomingMessage,missedCallTrace,bindIncomingMessageListener} from '../src/incoming-message.mjs';

function callMessage({id='call-1',action='recommened.misscall',contentAsString=false}={}){
  const content={action,params:'{}'};
  return{
    type:0,
    isSelf:false,
    threadId:'zalo-user-call',
    data:{
      msgId:id,
      msgType:'chat.recommended',
      ts:'1789128000000',
      content:contentAsString?JSON.stringify(content):content,
    },
  };
}

test('preserves typed Zalo missed-call provenance alongside legacy text',()=>{
  const event=normalizeIncomingMessage(callMessage());
  assert.equal(event?.zaloId,'zalo-user-call');
  assert.equal(event?.messageId,'call-1');
  assert.equal(event?.text,'Cuộc gọi nhỡ');
  assert.equal(event?.media,undefined);
  assert.equal(event?.eventKind,'missed_call');
  assert.equal(event?.call,undefined);
});

test('also accepts missed-call content when Zalo sends it as JSON string',()=>{
  const event=normalizeIncomingMessage(callMessage({id:'call-2',contentAsString:true}));
  assert.equal(event?.text,'Cuộc gọi nhỡ');
  assert.equal(event?.eventKind,'missed_call');
});

test('ignores ended-call summaries and other chat.recommended messages',()=>{
  assert.equal(normalizeIncomingMessage(callMessage({id:'call-3',action:'recommened.calltime'})),null);
  assert.equal(normalizeIncomingMessage(callMessage({id:'call-4',action:'recommened.link'})),null);
});

test('ordinary text, self messages and group events cannot trigger typed callbacks',()=>{
 const raw=callMessage();
 assert.equal(normalizeIncomingMessage({...raw,isSelf:true}),null);
 assert.equal(normalizeIncomingMessage({...raw,type:1})?.eventKind,undefined);
 const plain={...raw,data:{...raw.data,msgType:'webchat',content:'Cuộc gọi nhỡ'}};
 assert.equal(normalizeIncomingMessage(plain)?.eventKind,undefined);
 assert.equal(normalizeIncomingMessage(callMessage({action:'unverified.misscall'}))?.eventKind,undefined);
});

test('callback diagnostics distinguish source, self, group and unknown without leaking raw payload',async()=>{
 const raw=callMessage();const event=normalizeIncomingMessage(raw);
 assert.deepEqual(missedCallTrace(raw,event),{thread:'user',kind:'known',source:'recommended',self:false,typed:true,normalized:true});
 const self={...raw,isSelf:true};assert.equal(missedCallTrace(self,normalizeIncomingMessage(self)).self,true);
 const group={...raw,type:1};assert.equal(missedCallTrace(group,normalizeIncomingMessage(group)).typed,false);
 const unknown=callMessage({action:'private-token.misscall'});assert.equal(missedCallTrace(unknown,normalizeIncomingMessage(unknown)).kind,'unknown');
 assert.equal(missedCallTrace({...raw,data:{...raw.data,content:'Cuộc gọi nhỡ'}},null),null);
 let handler;const logs=[];const accepted=[];
 const stop=bindIncomingMessageListener({api:{listener:{on:(name,fn)=>{handler=fn},off:()=>{}}},onMessage:async e=>accepted.push(e),logger:{info:(...args)=>logs.push(args)}});
 await handler(raw);await handler(self);stop();
 assert.equal(accepted.length,1);assert.equal(logs.length,2);
 assert.equal(JSON.stringify(logs).includes('zalo-user-call'),false);assert.equal(JSON.stringify(logs).includes('call-1'),false);
});
