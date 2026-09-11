import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessageGateway} from '../src/message-gateway.mjs';

function fakeFetch(calls,responses=[]){
  return async (url,options={})=>{
    calls.push({url,options,body:JSON.parse(String(options.body||'{}'))});
    const next=responses.shift()||{ok:true,status:200,body:{ok:true}};
    return {
      ok:next.ok,
      status:next.status,
      async json(){return next.body;},
    };
  };
}

test('ingress posts normalized text through protected bridge endpoint',async()=>{
  const calls=[];
  const gateway=createMessageGateway({
    endpoint:'https://example.test/functions/v1/v21-zalo-bridge',
    bridgeToken:'secret',
    fetchImpl:fakeFetch(calls,[{ok:true,status:200,body:{ok:true,message_id:'chat-1'}}]),
  });
  const result=await gateway.ingestText({zaloId:'z1',messageId:'m1',text:'hello',eventAt:'2026-09-11T06:18:25.701Z'});
  assert.equal(result.messageId,'chat-1');
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers['x-bridge-token'],'secret');
  assert.deepEqual(calls[0].body,{
    action:'ingress',zalo_id:'z1',zalo_message_id:'m1',body:'hello',event_at:'2026-09-11T06:18:25.701Z'
  });
});

test('media ingress posts multipart binary and canonical metadata through the same protected endpoint',async()=>{
  const calls=[];
  const gateway=createMessageGateway({
    endpoint:'https://example.test/functions/v1/v21-zalo-bridge',
    bridgeToken:'secret',
    fetchImpl:async(url,options={})=>{
      calls.push({url,options});
      return {ok:true,status:200,async json(){return{ok:true,message_id:'chat-media-1',asset_id:'asset-1'};}};
    },
  });
  const result=await gateway.ingestMedia({
    zaloId:'z-media',messageId:'zm-1',text:'ảnh sản phẩm',eventAt:'2026-09-11T06:18:25.701Z',
    media:{kind:'image',widthPx:640,heightPx:480}
  },{
    data:Buffer.from('abc'),filename:'zalo-image.jpg',mimeType:'image/jpeg',sizeBytes:3,widthPx:640,heightPx:480
  });
  assert.deepEqual(result,{messageId:'chat-media-1',assetId:'asset-1'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers['x-bridge-token'],'secret');
  assert.equal(calls[0].options.body instanceof FormData,true);
  const form=calls[0].options.body;
  assert.equal(form.get('action'),'ingress_media');
  assert.equal(form.get('zalo_id'),'z-media');
  assert.equal(form.get('zalo_message_id'),'zm-1');
  assert.equal(form.get('body'),'ảnh sản phẩm');
  assert.equal(form.get('kind'),'image');
  assert.equal(form.get('mime_type'),'image/jpeg');
  assert.equal(form.get('width_px'),'640');
  assert.equal(form.get('height_px'),'480');
  const file=form.get('file');
  assert.equal(file.size,3);
  assert.equal(file.name,'zalo-image.jpg');
});

test('outbound due and result use one protected endpoint and preserve media metadata',async()=>{
  const calls=[];
  const gateway=createMessageGateway({
    endpoint:'https://example.test/functions/v1/v21-zalo-bridge',
    bridgeToken:'secret',
    fetchImpl:fakeFetch(calls,[
      {ok:true,status:200,body:{ok:true,rows:[{
        delivery_id:'d1',zalo_id:'z1',body:'reply',
        media:[{kind:'file',signed_url:'https://storage.test/file',file_name:'a.pdf',mime_type:'application/pdf',size_bytes:10,sort_index:0}]
      }]}},
      {ok:true,status:200,body:{ok:true}},
    ]),
  });
  const rows=await gateway.listOutbound(20);
  assert.deepEqual(rows,[{
    deliveryId:'d1',zaloId:'z1',text:'reply',
    media:[{kind:'file',signedUrl:'https://storage.test/file',fileName:'a.pdf',mimeType:'application/pdf',sizeBytes:10,widthPx:null,heightPx:null,sortIndex:0}]
  }]);
  await gateway.markOutboundResult({deliveryId:'d1',ok:true,zaloMessageId:'99'});
  assert.equal(calls[0].body.action,'outbound_due');
  assert.equal(calls[1].body.action,'outbound_result');
  assert.equal(calls[1].body.zalo_message_id,'99');
});

test('linked avatar sync is a dedicated startup action',async()=>{
  const calls=[];
  const gateway=createMessageGateway({
    endpoint:'https://example.test/functions/v1/v21-zalo-bridge',
    bridgeToken:'secret',
    fetchImpl:fakeFetch(calls,[{ok:true,status:200,body:{ok:true,count:1}}]),
  });
  const result=await gateway.syncLinkedAvatars();
  assert.equal(result.count,1);
  assert.equal(calls[0].body.action,'sync_linked_avatars');
});
