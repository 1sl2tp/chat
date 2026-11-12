import assert from "node:assert/strict";
import {requestBillGemini,BILL_OCR_FALLBACK_MODEL} from "../supabase/functions/v21-bank-bill-event/bill-gemini-failover.mjs";

const payload={contents:[{role:"user",parts:[{text:"untrusted bill only"},{inlineData:{mimeType:"image/jpeg",data:"AA=="}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:1100}};
const base="gemini-3.5-flash-lite";
const response=(status)=>({ok:status===200,status});
async function probe(statuses,{aborted=false}={}){
 const requests=[],signal={aborted};
 let index=0,waits=0;
 try{
  const result=await requestBillGemini({
   key:"unit-test-key",model:base,payload,signal,
   fetchFn:async(url,options)=>{requests.push({url,options});return response(statuses[index++]);},
   sleepFn:async ms=>{assert.equal(ms,800);waits++;}
  });
  return{requests,waits,result};
 }catch(error){return{requests,waits,error};}
}
const good=await probe([200]);
assert.equal(good.requests.length,1);
assert.equal(good.result.usedModel,base);
assert.equal(good.waits,0);

const recovered=await probe([503,200]);
assert.equal(recovered.requests.length,2);
assert.equal(recovered.waits,1);
assert.ok(recovered.requests[0].url.endsWith("/"+base+":generateContent"));
assert.ok(recovered.requests[1].url.endsWith("/"+BILL_OCR_FALLBACK_MODEL+":generateContent"));
assert.equal(recovered.result.usedModel,BILL_OCR_FALLBACK_MODEL);
for(const item of recovered.requests){
 assert.equal(item.options.method,"POST");
 assert.equal(item.options.headers["x-goog-api-key"],"unit-test-key");
 assert.deepEqual(JSON.parse(item.options.body),payload);
 assert.equal(item.options.signal,recovered.requests[0].options.signal);
}
const stillUnavailable=await probe([503,503]);
assert.equal(stillUnavailable.requests.length,2);
assert.equal(stillUnavailable.error.message,"gemini_http_503");
const quota=await probe([429,200]);
assert.equal(quota.requests.length,1);
assert.equal(quota.error.message,"gemini_http_429");
const invalid=await probe([400,200]);
assert.equal(invalid.requests.length,1);
assert.equal(invalid.error.message,"gemini_http_400");
const aborted=await probe([503,200],{aborted:true});
assert.equal(aborted.requests.length,1);
assert.equal(aborted.error.message,"AbortError");
let runs=0;
await assert.rejects(requestBillGemini({
 key:"unit-test-key",model:base,payload,
 fetchFn:async()=>{runs++;throw new Error("network_down");}
}),/network_down/);
assert.equal(runs,1);
assert.equal(typeof requestBillGemini,"function");
console.log("BANK-295 bounded 503 fallback, unchanged OCR evidence, fail-closed guard PASS");
