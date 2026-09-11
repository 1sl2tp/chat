import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIncomingMessage,bindIncomingMessageListener} from '../src/incoming-message.mjs';

const USER=0;
const GROUP=1;

test('normalizes new direct-user text from zca listener',()=>{
  const event=normalizeIncomingMessage({
    type:USER,
    isSelf:false,
    threadId:'zalo-user-1',
    data:{msgId:'msg-1',cliMsgId:'cli-1',msgType:'webchat',ts:'1789105000000',content:' xin chào '}
  });
  assert.deepEqual(event,{
    zaloId:'zalo-user-1',
    messageId:'msg-1',
    text:'xin chào',
    eventAt:'2026-09-11T05:36:40.000Z'
  });
});

test('normalizes inbound Zalo photo into canonical media metadata',()=>{
  const event=normalizeIncomingMessage({
    type:USER,
    isSelf:false,
    threadId:'zalo-user-2',
    data:{
      msgId:'photo-1',
      msgType:'chat.photo',
      ts:'1789105000000',
      content:{
        href:'https://cdn.example.test/photo.jpg',
        thumb:'https://cdn.example.test/photo-thumb.jpg',
        description:' ảnh sản phẩm ',
        params:JSON.stringify({hdSize:'1234',width:640,height:480})
      }
    }
  });
  assert.deepEqual(event,{
    zaloId:'zalo-user-2',
    messageId:'photo-1',
    text:'ảnh sản phẩm',
    eventAt:'2026-09-11T05:36:40.000Z',
    media:[{
      kind:'image',
      sourceUrl:'https://cdn.example.test/photo.jpg',
      thumbUrl:'https://cdn.example.test/photo-thumb.jpg',
      fileName:null,
      mimeType:'image/jpeg',
      sizeBytes:1234,
      widthPx:640,
      heightPx:480
    }]
  });
});

test('normalizes JSON-string share.file and prefers fileUrl for download',()=>{
  const event=normalizeIncomingMessage({
    type:USER,
    isSelf:false,
    threadId:'zalo-user-3',
    data:{
      msgId:'file-1',
      msgType:'share.file',
      ts:'1789105000000',
      content:JSON.stringify({
        title:'bao-cao.xlsx',
        fileUrl:'https://cdn.example.test/files/opaque-download',
        totalSize:2048
      })
    }
  });
  assert.deepEqual(event,{
    zaloId:'zalo-user-3',
    messageId:'file-1',
    text:'',
    eventAt:'2026-09-11T05:36:40.000Z',
    media:[{
      kind:'file',
      sourceUrl:'https://cdn.example.test/files/opaque-download',
      thumbUrl:null,
      fileName:'bao-cao.xlsx',
      mimeType:'application/octet-stream',
      sizeBytes:2048,
      widthPx:null,
      heightPx:null
    }]
  });
});

test('ignores self, group and unsupported non-text messages',()=>{
  assert.equal(normalizeIncomingMessage({type:USER,isSelf:true,threadId:'z1',data:{msgId:'m1',msgType:'webchat',ts:'1',content:'x'}}),null);
  assert.equal(normalizeIncomingMessage({type:GROUP,isSelf:false,threadId:'g1',data:{msgId:'m2',msgType:'webchat',ts:'1',content:'x'}}),null);
  assert.equal(normalizeIncomingMessage({type:USER,isSelf:false,threadId:'z1',data:{msgId:'m3',msgType:'chat.sticker',ts:'1',content:{type:'sticker'}}}),null);
});

test('binds message listener and forwards only normalized events',async()=>{
  let messageHandler=null;
  const api={listener:{on(name,handler){assert.equal(name,'message');messageHandler=handler;}}};
  const seen=[];
  const unbind=bindIncomingMessageListener({api,onMessage:event=>{seen.push(event);}});
  assert.equal(typeof messageHandler,'function');
  await messageHandler({type:USER,isSelf:false,threadId:'z2',data:{msgId:'m9',msgType:'webchat',ts:'1789105000000',content:'hello'}});
  assert.equal(seen.length,1);
  assert.equal(seen[0].zaloId,'z2');
  assert.equal(typeof unbind,'function');
});
