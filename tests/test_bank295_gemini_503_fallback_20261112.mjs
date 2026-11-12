import assert from "node:assert/strict";
import {requestBillGemini,BILL_OCR_FALLBACK_MODEL,BILL_OCR_MAX_MODEL_REQUESTS}
 from "../supabase/functions/v21-bank-bill-event/bill-gemini-failover.mjs";

const payload={contents:[{role:"user",parts:[{text:"untrusted bill only"},{inlineData:{mimeType:"image/jpeg",data:"AA=="}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:1100}};
const base="gemini-3.5-flash-lite",response=(status)=>({ok:status===200,status});

async function probe(statuses,{aborted=false,abortAfterWait=false}={}){
 const requests=[],signal={aborted},waits=[],logs=[];
 let index=0;
 try{
  const result=await requestBillGemini({
   key:"unit-test-key",model:base,payload,signal,
   fetchFn:async(url,options)=>{
     requests.push({url,options});
     const code=statuses[index++];
     if(code===undefined)throw new Error("unexpected_extra_model_call");
     return response(code);
   },
   sleepFn:async ms=>{waits.push(ms);if(abortAfterWait)signal.aborted=true;},
   logFn:(event,meta)=>{logs.push({event,meta});}
  });
  return{requests,waits,logs,result};
 }catch(error){return{requests,waits,logs,error};}
}
assert.equal(BILL_OCR_MAX_MODEL_REQUESTS,3);
let good=await probe([200]);
assert.equal(good.requests.length,1);
assert.equal(good.result.usedModel,base);
assert.deepEqual(good.waits,[]);

const recovered=await probe([503,200]);
assert.equal(recovered.requests.length,2);
assert.deepEqual(recovered.waits,[800]);
assert.ok(recovered.requests[0].url.endsWith("/"+base+":generateContent"));
assert.ok(recovered.requests[1].url.endsWith("/"+BILL_OCR_FALLBACK_MODEL+":generateContent"));
assert.equal(recovered.result.usedModel,BILL_OCR_FALLBACK_MODEL);
for(const item of recovered.requests){
 assert.equal(item.options.method,"POST");
 assert.equal(item.options.headers["x-goog-api-key"],"unit-test-key");
 assert.deepEqual(JSON.parse(item.options.body),payload);
 assert.equal(item.options.signal,recovered.requests[0].options.signal);
}

const thirdRecovers=await probe([503,503,200]);
assert.equal(thirdRecovers.requests.length,3);
assert.deepEqual(thirdRecovers.waits,[800,1400]);
assert.equal(thirdRecovers.result.usedModel,base);
assert.ok(thirdRecovers.requests[2].url.endsWith("/"+base+":generateContent"));
assert.deepEqual(thirdRecovers.logs.map(x=>x.meta.stage),
 ["primary","alternate","last_capacity_retry"]);
assert.deepEqual(thirdRecovers.logs.map(x=>x.meta.status),[503,503,200]);
assert.ok(thirdRecovers.logs.every(x=>x.event==="bank_bill_gemini_attempt"));
assert.ok(thirdRecovers.logs.every(x=>Object.keys(x.meta).sort().join(",")==="elapsed_ms,model,stage,status"));
const stillUnavailable=await probe([503,503,503]);
assert.equal(stillUnavailable.requests.length,3);
assert.deepEqual(stillUnavailable.waits,[800,1400]);
assert.equal(stillUnavailable.error.message,"gemini_http_503",
 "KEEP bank186 SQL cron-compatible error code");

for(const transient of [502,503,504]){
 const variant=await probe([transient,200]);
 assert.equal(variant.result.usedModel,BILL_OCR_FALLBACK_MODEL);
 assert.equal(variant.requests.length,2);
 const last=await probe([transient,transient,transient]);
 assert.equal(last.error.message,"gemini_http_"+transient);
 assert.equal(last.requests.length,3);
}
const fallbackReject=await probe([503,429,200]);
assert.equal(fallbackReject.requests.length,2);
assert.equal(fallbackReject.error.message,"gemini_http_429");
const quota=await probe([429,200]);
assert.equal(quota.requests.length,1);
assert.equal(quota.error.message,"gemini_http_429");
for(const n of [400,401,403,404,408,500]){
 const blocked=await probe([n,200]);
 assert.equal(blocked.requests.length,1,"no inline retries for "+n);
 assert.equal(blocked.error.message,"gemini_http_"+n);
}
const aborted=await probe([503,200],{aborted:true});
assert.equal(aborted.requests.length,0);
assert.equal(aborted.error.message,"AbortError");
const abortedBeforeAlternate=await probe([503,200],{abortAfterWait:true});
assert.equal(abortedBeforeAlternate.requests.length,1);
assert.equal(abortedBeforeAlternate.error.message,"AbortError");
let sends=0,errors=[];
await assert.rejects(requestBillGemini({
 key:"unit-test-key",model:base,payload,
 logFn:(k,v)=>errors.push({k,v}),
 fetchFn:async()=>{sends++;throw new Error("network_down");}
}),/network_down/);
assert.equal(sends,1,"Network errors are handled by existing longer DB retry, not unbounded re-sends");
assert.equal(errors.length,1);
assert.equal(errors[0].v.error_type,"network");
await assert.rejects(requestBillGemini({key:"",model:base,payload,fetchFn:async()=>response(200)}),/gemini_key_missing/);
assert.equal(typeof requestBillGemini,"function");
console.log("BANK-301 Gemini bounded 503/502/504 recovery, no quota loops, no private logging, existing cron guard PASS");
