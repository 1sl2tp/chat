import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../src/bridge-core.mjs';

const NOW='2026-09-11T04:30:00.000Z';

function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

function makeAdapter(){
  let handler=null;
  const sent=[];
  let stopped=0;
  return {
    sent,
    get stopped(){return stopped;},
    async start(next){handler=next;},
    async emit(event){return handler?.(event);},
    async sendText(payload){sent.push(payload);return {messageId:`z-${sent.length}`};},
    async stop(){stopped+=1;handler=null;},
  };
}

function makeGateway(){
  const ingress=[];
  const profiles=[];
  const results=[];
  let outbound=[];
  let listCalls=0;
  return {
    ingress,profiles,results,
    setOutbound(rows){outbound=rows.slice();},
    get listCalls(){return listCalls;},
    async upsertContact(profile){profiles.push(profile);},
    async ingestText(event){ingress.push(event);return null;},
    async listOutbound(){listCalls+=1;return outbound.slice();},
    async markOutboundResult(result){results.push(result);},
  };
}

test('valid inbound text is passed once to the gateway and profile discovery is optional', async()=>{
  const adapter=makeAdapter();
  const gateway=makeGateway();
  const bridge=createBridge({adapter,gateway,clock:()=>NOW,logger:{warn(){},error(){},info(){}}});
  await bridge.start();
  const event={zaloId:'z1',messageId:'m1',text:'hello',eventAt:NOW,profile:{zaloId:'z1',displayName:'C Sâm'}};
  await adapter.emit(event);
  await adapter.emit(event);
  assert.equal(gateway.ingress.length,1);
  assert.equal(gateway.profiles.length,1);
});

test('gateway may ignore an unlinked inbound event without creating retry work', async()=>{
  const adapter=makeAdapter();
  const gateway=makeGateway();
  gateway.ingestText=async event=>{gateway.ingress.push(event);return null;};
  const bridge=createBridge({adapter,gateway,logger:{warn(){},error(){},info(){}}});
  await bridge.start();
  await adapter.emit({zaloId:'z2',messageId:'m2',text:'unlinked',eventAt:NOW});
  assert.equal(gateway.ingress.length,1);
  assert.deepEqual(gateway.results,[]);
});

test('one outbound delivery calls adapter once and records success', async()=>{
  const adapter=makeAdapter();
  const gateway=makeGateway();
  gateway.setOutbound([{deliveryId:'d1',zaloId:'z1',text:'xin chao'}]);
  const bridge=createBridge({adapter,gateway,logger:{warn(){},error(){},info(){}}});
  await bridge.start();
  assert.equal(await bridge.pollOutbound(),1);
  assert.deepEqual(adapter.sent,[{zaloId:'z1',text:'xin chao'}]);
  assert.deepEqual(gateway.results,[{deliveryId:'d1',ok:true,zaloMessageId:'z-1'}]);
});

test('failed outbound send records failure without throwing out of the poll', async()=>{
  const adapter=makeAdapter();
  adapter.sendText=async()=>{throw new Error('offline');};
  const gateway=makeGateway();
  gateway.setOutbound([{deliveryId:'d2',zaloId:'z2',text:'hello'}]);
  const bridge=createBridge({adapter,gateway,logger:{warn(){},error(){},info(){}}});
  await bridge.start();
  assert.equal(await bridge.pollOutbound(),1);
  assert.equal(gateway.results.length,1);
  assert.equal(gateway.results[0].deliveryId,'d2');
  assert.equal(gateway.results[0].ok,false);
  assert.match(gateway.results[0].error,/offline/);
});

test('outbound polling is single-flight', async()=>{
  const adapter=makeAdapter();
  const gate=deferred();
  const gateway=makeGateway();
  gateway.listOutbound=async()=>{gateway._listCalls=(gateway._listCalls||0)+1;await gate.promise;return [];};
  const bridge=createBridge({adapter,gateway,logger:{warn(){},error(){},info(){}}});
  await bridge.start();
  const first=bridge.pollOutbound();
  const second=bridge.pollOutbound();
  assert.equal(await second,0);
  gate.resolve();
  assert.equal(await first,0);
  assert.equal(gateway._listCalls,1);
});

test('stop closes the adapter once', async()=>{
  const adapter=makeAdapter();
  const gateway=makeGateway();
  const bridge=createBridge({adapter,gateway,logger:{warn(){},error(){},info(){}}});
  await bridge.start();
  await bridge.stop();
  await bridge.stop();
  assert.equal(adapter.stopped,1);
});
