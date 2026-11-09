import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {recoverZaloHistory,armZaloHistoryRecovery} from '../src/history-recovery.mjs';

const since='2026-11-08T12:30:00.000Z';
const until='2026-11-09T03:00:00.000Z';
const ts=(s)=>String(Date.parse(s));
const event=(id,time,{photo=false,linked=true,self=false}={})=>({
  type:0,isSelf:self,threadId:linked?'linked':'unlinked',
  data:{msgId:id,msgType:photo?'chat.photo':'webchat',ts:ts(time),
    content:photo?{oriUrl:'https://img.example.test/real.jpg'}:'hello'}
});
const logger={info(){},warn(){}};

function fakeApi(pages){
  const listener=new EventEmitter();
  listener.requestOldMessages=(type,cursor)=>{
    const index=listener.calls.length;
    listener.calls.push({type,cursor});
    queueMicrotask(()=>listener.emit('old_messages',pages[index]||[],type));
  };
  listener.calls=[];
  return {listener};
}
function gateway(){
  const calls={text:[],media:[],targets:[]};
  return {calls,async listLinkedZaloIds(){return ['linked'];},
    async ingestText(e){calls.text.push(e);return{messageId:'chat-'+e.messageId};},
    async mediaTarget(e){calls.targets.push(e);return{needed:true,existing:false};},
    async ingestMedia(e,b){calls.media.push({e,b});return{messageId:'chat-'+e.messageId};}
  };
}

test('replays linked messages and original images in the outage window only',async()=>{
  const api=fakeApi([
    [event('new','2026-11-09T01:00:00.000Z'),
      event('photo','2026-11-08T13:00:00.000Z',{photo:true}),
      event('alien','2026-11-08T13:00:00.000Z',{linked:false}),
      event('self','2026-11-08T13:00:00.000Z',{self:true})],
    [event('old','2026-11-08T12:00:00.000Z')],
    [],
  ]);
  const g=gateway();
  const s=await recoverZaloHistory({api,gateway:g,since,until,logger,delayMs:0,
    download:async({media})=>({data:Buffer.from('jpeg'),mimeType:'image/jpeg',filename:'x.jpg',sizeBytes:4,source:media.sourceUrl})});
  assert.equal(g.calls.text.length,1);
  assert.equal(g.calls.media.length,1);
  assert.equal(g.calls.media[0].e.eventAt,'2026-11-08T13:00:00.000Z');
  assert.equal(g.calls.media[0].b.source,'https://img.example.test/real.jpg');
  assert.equal(s.acceptedText,1);
  assert.equal(s.acceptedMedia,1);
  assert.equal(s.completeUser,true);
});

test('skips already stored media rather than downloading it again',async()=>{
  const api=fakeApi([[event('photo','2026-11-09T01:00:00.000Z',{photo:true})],[],[]]);
  const g=gateway();
  g.mediaTarget=async()=>({needed:true,existing:true});
  let downloadCalls=0;
  const stats=await recoverZaloHistory({api,gateway:g,since,until,logger,delayMs:0,
    download:async()=>{downloadCalls++;throw Error('unexpected');}});
  assert.equal(stats.existingMedia,1);
  assert.equal(stats.acceptedMedia,0);
  assert.equal(downloadCalls,0);
});

test('rejects invalid recovery bounds before reading Zalo data',async()=>{
  const api=fakeApi([]);
  const g=gateway();
  await assert.rejects(()=>recoverZaloHistory({api,gateway:g,since:'bad',until,logger}),/invalid_config/);
  assert.equal(api.listener.calls.length,0);
});

test('arms once on cipher key and can be cancelled before starting',async()=>{
  const api=fakeApi([[],[]]);
  const g=gateway();
  const stop=armZaloHistoryRecovery({api,gateway:g,since,until,logger,delayMs:0});
  stop();
  api.listener.emit('cipher_key','key');
  assert.equal(api.listener.calls.length,0);
});
