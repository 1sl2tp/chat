import assert from 'node:assert/strict';
import {normalizeInvokeResult} from '../order-scribe-client.js';

assert.equal(normalizeInvokeResult({data:{ok:true,items:[]},error:null}).ok,true);
assert.throws(
  ()=>normalizeInvokeResult({data:{ok:false,error:'quick_parse_failed'},error:null}),
  /quick_parse_failed/
);
assert.throws(
  ()=>normalizeInvokeResult({data:null,error:{message:'FunctionsHttpError',context:{status:200}}}),
  /invalid_response/
);

console.log('order scribe client runtime PASS');
