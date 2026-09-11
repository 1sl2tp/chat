import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoginState, createRequestHandler} from '../src/login-server-core.mjs';
import {startZaloLogin} from '../src/login-runtime.mjs';

function makeResponse(){
  const headers={};
  return {
    statusCode:200,
    headers,
    body:Buffer.alloc(0),
    setHeader(name,value){headers[String(name).toLowerCase()]=String(value);},
    end(value=''){this.body=Buffer.isBuffer(value)?value:Buffer.from(String(value));},
  };
}

test('health reports waiting_qr then logged_in',()=>{
  const state=createLoginState();
  assert.equal(state.snapshot().status,'starting');
  state.setWaitingQr();
  assert.equal(state.snapshot().status,'waiting_qr');
  state.setLoggedIn({userId:'me'});
  assert.equal(state.snapshot().status,'logged_in');
  assert.equal(state.snapshot().userId,'me');
});

test('health endpoint returns JSON state',async()=>{
  const state=createLoginState();
  state.setWaitingQr();
  const handler=createRequestHandler({state,qrPath:'/tmp/not-created.png'});
  const req={method:'GET',url:'/health'};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['content-type'],'application/json; charset=utf-8');
  assert.equal(JSON.parse(res.body.toString()).status,'waiting_qr');
});

test('qr endpoint returns 404 until qr file exists',async()=>{
  const state=createLoginState();
  const handler=createRequestHandler({state,qrPath:'/tmp/not-created.png'});
  const req={method:'GET',url:'/qr.png'};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,404);
});

test('root page points at qr image and health state',async()=>{
  const state=createLoginState();
  const handler=createRequestHandler({state,qrPath:'/tmp/not-created.png'});
  const req={method:'GET',url:'/'};
  const res=makeResponse();
  await handler(req,res);
  const html=res.body.toString();
  assert.equal(res.statusCode,200);
  assert.match(html,/qr\.png/);
  assert.match(html,/health/);
  assert.match(html,/Quét mã QR bằng Zalo/i);
});

test('login runtime writes QR path, marks logged in and starts listener',async()=>{
  const state=createLoginState();
  const calls=[];
  const api={
    getContext(){return {uid:'zalo-self'};},
    listener:{start(){calls.push('listener.start');}},
  };
  class FakeZalo{
    constructor(options){calls.push(['ctor',options]);}
    async loginQR(options){calls.push(['loginQR',options]);return api;}
  }
  const result=await startZaloLogin({ZaloClass:FakeZalo,state,qrPath:'/tmp/zalo-qr.png'});
  assert.equal(result,api);
  assert.equal(state.snapshot().status,'logged_in');
  assert.equal(state.snapshot().userId,'zalo-self');
  assert.deepEqual(calls[1],['loginQR',{qrPath:'/tmp/zalo-qr.png'}]);
  assert.equal(calls.at(-1),'listener.start');
});
