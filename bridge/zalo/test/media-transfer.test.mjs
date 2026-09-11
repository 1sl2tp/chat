import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadInboundMedia,buildOutboundMessage} from '../src/media-transfer.mjs';

function responseFrom(bytes,{status=200,contentType='application/octet-stream',contentLength=null}={}){
  const data=Buffer.from(bytes);
  return {
    ok:status>=200&&status<300,
    status,
    headers:{
      get(name){
        const key=String(name||'').toLowerCase();
        if(key==='content-type')return contentType;
        if(key==='content-length')return contentLength==null?String(data.length):String(contentLength);
        return null;
      }
    },
    async arrayBuffer(){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}
  };
}

test('downloads inbound Zalo image with session headers and canonical metadata',async()=>{
  const calls=[];
  const api={
    getContext(){
      return {
        userAgent:'Mozilla/Test',
        cookie:{getCookieStringSync(url){assert.equal(url,'https://cdn.example.test/photo.jpg');return 'zalo_session=abc';}}
      };
    }
  };
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    return responseFrom('image-bytes',{contentType:'image/jpeg'});
  };
  const result=await downloadInboundMedia({
    api,
    fetchImpl,
    media:{
      kind:'image',sourceUrl:'https://cdn.example.test/photo.jpg',fileName:null,mimeType:'image/jpeg',
      sizeBytes:0,widthPx:640,heightPx:480
    }
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers.cookie,'zalo_session=abc');
  assert.equal(calls[0].options.headers['user-agent'],'Mozilla/Test');
  assert.equal(calls[0].options.headers.referer,'https://chat.zalo.me/');
  assert.equal(result.data.toString(),'image-bytes');
  assert.equal(result.mimeType,'image/jpeg');
  assert.equal(result.filename,'zalo-image.jpg');
  assert.equal(result.sizeBytes,11);
  assert.equal(result.widthPx,640);
  assert.equal(result.heightPx,480);
});

test('rejects oversized inbound media before reading the body',async()=>{
  let read=false;
  const fetchImpl=async()=>({
    ok:true,status:200,
    headers:{get(name){return String(name).toLowerCase()==='content-length'?String(15*1024*1024+1):'application/octet-stream';}},
    async arrayBuffer(){read=true;return new ArrayBuffer(0);}
  });
  await assert.rejects(
    ()=>downloadInboundMedia({fetchImpl,media:{kind:'file',sourceUrl:'https://cdn.example.test/huge',fileName:'huge.zip'}}),
    /media_size_out_of_range/
  );
  assert.equal(read,false);
});

test('builds Zalo attachments from signed CHAT media URLs without temp files',async()=>{
  const requested=[];
  const fetchImpl=async url=>{
    requested.push(String(url));
    if(String(url).includes('image'))return responseFrom('img',{contentType:'image/png'});
    return responseFrom('sheet',{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  };
  const payload=await buildOutboundMessage({
    text:'gửi bạn',
    media:[
      {kind:'image',signedUrl:'https://storage.example.test/image',mimeType:'image/png',sizeBytes:3,widthPx:320,heightPx:240,sortIndex:0},
      {kind:'file',signedUrl:'https://storage.example.test/file',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',fileName:'bang-gia.xlsx',sizeBytes:5,sortIndex:1}
    ]
  },{fetchImpl});
  assert.deepEqual(requested,['https://storage.example.test/image','https://storage.example.test/file']);
  assert.equal(payload.msg,'gửi bạn');
  assert.equal(payload.attachments.length,2);
  assert.equal(payload.attachments[0].filename,'image-1.png');
  assert.equal(payload.attachments[0].metadata.width,320);
  assert.equal(payload.attachments[0].metadata.height,240);
  assert.equal(payload.attachments[1].filename,'bang-gia.xlsx');
  assert.equal(payload.attachments[1].data.toString(),'sheet');
});
