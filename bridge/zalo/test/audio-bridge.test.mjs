import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizeIncomingMessage} from '../src/incoming-message.mjs';
import {downloadInboundMedia} from '../src/media-transfer.mjs';

function responseFrom(bytes,{status=200,contentType='application/octet-stream'}={}){
  const data=Buffer.from(bytes);
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get(name){
      const key=String(name||'').toLowerCase();
      if(key==='content-type')return contentType;
      if(key==='content-length')return String(data.length);
      return null;
    }},
    async arrayBuffer(){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}
  };
}

test('normalizes inbound Zalo chat.voice as canonical audio media',()=>{
  const event=normalizeIncomingMessage({
    type:0,
    isSelf:false,
    threadId:'zalo-user-voice',
    data:{
      msgId:'voice-1',
      msgType:'chat.voice',
      ts:'1789105000000',
      content:JSON.stringify({
        voiceUrl:'https://cdn.example.test/voice/voice-1.m4a',
        m4aUrl:'https://cdn.example.test/voice/voice-1.m4a',
        fileSize:4096,
        duration:12
      })
    }
  });
  assert.deepEqual(event,{
    zaloId:'zalo-user-voice',
    messageId:'voice-1',
    text:'',
    eventAt:'2026-09-11T05:36:40.000Z',
    media:[{
      kind:'audio',
      sourceUrl:'https://cdn.example.test/voice/voice-1.m4a',
      thumbUrl:null,
      fileName:null,
      mimeType:'audio/mp4',
      sizeBytes:4096,
      widthPx:null,
      heightPx:null
    }]
  });
});

test('downloads inbound Zalo audio with session headers without treating it as a file',async()=>{
  const api={getContext(){return{
    userAgent:'Mozilla/Test',
    cookie:{getCookieStringSync(){return 'zalo_session=voice';}}
  };}};
  const binary=await downloadInboundMedia({
    api,
    fetchImpl:async()=>responseFrom('voice-bytes',{contentType:'audio/mp4'}),
    media:{kind:'audio',sourceUrl:'https://cdn.example.test/voice/voice-1.m4a',mimeType:'audio/mp4'}
  });
  assert.equal(binary.data.toString(),'voice-bytes');
  assert.equal(binary.mimeType,'audio/mp4');
  assert.equal(binary.filename,'zalo-audio.m4a');
  assert.equal(binary.widthPx,null);
  assert.equal(binary.heightPx,null);
});

test('server routes outbound canonical audio through zca sendVoice, not generic attachments',async()=>{
  const source=await fs.readFile(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(source,/api\.sendVoice/);
  assert.match(source,/kind\s*===?\s*['"]audio['"]/);
  assert.match(source,/voiceUrl/);
});
