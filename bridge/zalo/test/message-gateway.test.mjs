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

test('outbound due and result use one protected endpoint',async()=>{
  const calls=[];
  const gateway=createMessageGateway({
    endpoint:'https://example.test/functions/v1/v21-zalo-bridge',
    bridgeToken:'secret',
    fetchImpl:fakeFetch(calls,[
      {ok:true,status:200,body:{ok:true,rows:[{delivery_id:'d1',zalo_id:'z1',body:'reply'}]}},
      {ok:true,status:200,body:{ok:true}},
    ]),
  });
  const rows=await gateway.listOutbound(20);
  assert.deepEqual(rows,[{deliveryId:'d1',zaloId:'z1',text:'reply'}]);
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
