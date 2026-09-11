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

test('outbound signal endpoint rejects a bad bridge hash',async()=>{
  const state=createLoginState();
  let calls=0;
  const handler=createRequestHandler({
    state,
    qrPath:'/tmp/not-created.png',
    signalTokenHash:'abc123',
    outboundNow:async()=>{calls+=1;return 0;},
  });
  const req={method:'POST',url:'/outbound-now',headers:{'x-bridge-token-sha256':'wrong'}};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,401);
  assert.equal(calls,0);
});

test('outbound signal endpoint invokes the outbound poll immediately',async()=>{
  const state=createLoginState();
  let calls=0;
  const handler=createRequestHandler({
    state,
    qrPath:'/tmp/not-created.png',
    signalTokenHash:'abc123',
    outboundNow:async()=>{calls+=1;return 2;},
  });
  const req={method:'POST',url:'/outbound-now',headers:{'x-bridge-token-sha256':'abc123'}};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(calls,1);
  assert.deepEqual(JSON.parse(res.body.toString()),{ok:true,processed:2});
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

test('login runtime restores saved credentials before falling back to QR',async()=>{
  const state=createLoginState();
  const calls=[];
  const saved={cookie:[{name:'zpsid',value:'cookie'}],imei:'imei-1',userAgent:'ua-1'};
  const api={
    getContext(){return {uid:'zalo-self'};},
    listener:{start(){calls.push('listener.start');}},
  };
  class FakeZalo{
    constructor(options){calls.push(['ctor',options]);}
    async login(credentials){calls.push(['login',credentials]);return api;}
    async loginQR(options){calls.push(['loginQR',options]);return api;}
  }
  const sessionStore={
    async load(){calls.push('store.load');return saved;},
    async save(){calls.push('store.save');},
  };
  await startZaloLogin({ZaloClass:FakeZalo,state,qrPath:'/tmp/zalo-qr.png',sessionStore});
  assert.deepEqual(calls[1],'store.load');
  assert.deepEqual(calls[2],['login',saved]);
  assert.equal(calls.some(call=>Array.isArray(call)&&call[0]==='loginQR'),false);
  assert.equal(calls.includes('store.save'),false);
});

test('login runtime saves cookie imei and userAgent after QR login',async()=>{
  const state=createLoginState();
  const calls=[];
  const credentials={cookie:[{name:'zpsid',value:'cookie'}],imei:'imei-2',userAgent:'ua-2'};
  const api={
    getContext(){return {uid:'zalo-self',imei:credentials.imei,userAgent:credentials.userAgent,cookie:{toJSON(){return {cookies:credentials.cookie};}}};},
    listener:{start(){calls.push('listener.start');}},
  };
  class FakeZalo{
    async login(){throw new Error('should not restore');}
    async loginQR(options){calls.push(['loginQR',options]);return api;}
  }
  const sessionStore={
    async load(){calls.push('store.load');return null;},
    async save(value){calls.push(['store.save',value]);},
  };
  await startZaloLogin({ZaloClass:FakeZalo,state,qrPath:'/tmp/zalo-qr.png',sessionStore});
  assert.deepEqual(calls[0],'store.load');
  assert.deepEqual(calls[1],['loginQR',{qrPath:'/tmp/zalo-qr.png'}]);
  assert.deepEqual(calls[2],['store.save',credentials]);
});

test('contacts endpoint requires an active Zalo login',async()=>{
  const state=createLoginState();
  const handler=createRequestHandler({
    state,
    qrPath:'/tmp/not-created.png',
    accessToken:'secret',
    listFriends:async()=>[],
  });
  const req={method:'GET',url:'/contacts?token=secret'};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,409);
  assert.equal(JSON.parse(res.body.toString()).error,'zalo_not_logged_in');
});

test('contacts endpoint returns only id name and avatar from Zalo friends',async()=>{
  const state=createLoginState();
  state.setLoggedIn({userId:'me'});
  const handler=createRequestHandler({
    state,
    qrPath:'/tmp/not-created.png',
    accessToken:'secret',
    listFriends:async()=>[
      {userId:'z1',displayName:'C Sâm Phủ Lý',zaloName:'Sâm',avatar:'https://img/1.jpg',phoneNumber:'hidden'},
      {userId:'z2',displayName:'',zaloName:'Anh Bình',avatar:'https://img/2.jpg'},
    ],
  });
  const req={method:'GET',url:'/contacts?token=secret'};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,200);
  const body=JSON.parse(res.body.toString());
  assert.deepEqual(body,{
    ok:true,
    count:2,
    contacts:[
      {id:'z1',name:'C Sâm Phủ Lý',avatar:'https://img/1.jpg'},
      {id:'z2',name:'Anh Bình',avatar:'https://img/2.jpg'},
    ],
  });
});
