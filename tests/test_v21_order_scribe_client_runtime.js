import assert from 'node:assert/strict';
import {normalizeInvokeResult} from '../order-scribe-client.js';

assert.equal((await normalizeInvokeResult({data:{ok:true,items:[]},error:null})).ok,true);
await assert.rejects(
  async()=>await normalizeInvokeResult({data:{ok:false,error:'quick_parse_failed'},error:null}),
  /quick_parse_failed/
);
await assert.rejects(
  async()=>await normalizeInvokeResult({data:null,error:{message:'FunctionsHttpError',context:{status:200}}}),
  /invalid_response/
);

const bodyResponse={
  status:422,
  clone(){return this;},
  async json(){return {ok:false,error:'ai_items_missing'};},
};
await assert.rejects(
  async()=>await normalizeInvokeResult({data:null,error:{message:'FunctionsHttpError',context:bodyResponse}}),
  /ai_items_missing/,
  'FunctionsHttpError must surface the backend error code instead of hiding every non-2xx response as invalid_response',
);

console.log('order scribe client runtime PASS');
