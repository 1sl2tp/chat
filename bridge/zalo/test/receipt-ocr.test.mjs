import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {parseReceiptOcr} from '../src/receipt-ocr-core.mjs';
import {createLoginState,createRequestHandler} from '../src/login-server-core.mjs';

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

test('receipt OCR parser extracts exact Agribank bill fields without AI',()=>{
  const full=[
    'Chuyen tien thanh cong',
    '8,370,000 VND',
    '20:15 - 05/10/2026',
    'BUI XUAN TUNG',
    'Agribank (VBA)',
  ].join('\n');
  const digits=['8370000','2015','05102026','2901181999999'].join('\n');
  assert.deepEqual(parseReceiptOcr(full,digits),{
    is_bank_receipt:true,
    bank_name:'Agribank',
    recipient_name:'BUI XUAN TUNG',
    recipient_account:'2901181999999',
    amount_vnd:8370000,
    transfer_at:'2026-10-05T20:15:00+07:00',
    transaction_ref:null,
    extraction_engine:'tesseract-ocr',
  });
});

test('receipt OCR parser refuses to invent an account',()=>{
  const full='8,370,000 VND\n20:15 - 05/10/2026\nBUI XUAN TUNG\nAgribank (VBA)';
  const result=parseReceiptOcr(full,'290118199');
  assert.equal(result.recipient_account,null);
});

test('receipt OCR HTTP endpoint is bridge-hash protected and forwards only a job id',async()=>{
  const state=createLoginState();
  let seen='';
  const handler=createRequestHandler({
    state,
    qrPath:'/tmp/not-created.png',
    signalTokenHash:'hash-ok',
    receiptOcr:async jobId=>{seen=jobId;return {status:'applied'};},
  });
  const body=JSON.stringify({job_id:'a3d587c3-98d2-4359-9548-91d068260005'});
  const req=Readable.from([body]);
  req.method='POST';
  req.url='/receipt-ocr';
  req.headers={'x-bridge-token-sha256':'hash-ok'};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(seen,'a3d587c3-98d2-4359-9548-91d068260005');
  assert.equal(JSON.parse(res.body.toString()).status,'applied');
});

test('receipt OCR HTTP endpoint rejects a bad bridge hash',async()=>{
  const state=createLoginState();
  let called=false;
  const handler=createRequestHandler({
    state,
    qrPath:'/tmp/not-created.png',
    signalTokenHash:'hash-ok',
    receiptOcr:async()=>{called=true;},
  });
  const req=Readable.from([JSON.stringify({job_id:'a3d587c3-98d2-4359-9548-91d068260005'})]);
  req.method='POST';
  req.url='/receipt-ocr';
  req.headers={'x-bridge-token-sha256':'wrong'};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,401);
  assert.equal(called,false);
});
