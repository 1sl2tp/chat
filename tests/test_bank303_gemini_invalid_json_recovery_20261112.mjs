import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 requestParsedBillGemini,parseBillGeminiResponse,
 BILL_OCR_FALLBACK_MODEL,BILL_OCR_MAX_MODEL_REQUESTS
} from "../supabase/functions/v21-bank-bill-event/bill-gemini-failover.mjs";

// Technical 200-response errors are NOT invalid customer bills.
// This is mock-only: no external model call, bank credit, customer, or ledger.
const main="gemini-3.5-flash-lite";
const base={contents:[{role:"user",parts:[{text:"demo"},{inlineData:{mimeType:"image/jpeg",data:"AA=="}}]}],
 generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:1800}};
function returnedModel(text,{status=200,finishReason="STOP",brokenBody=false}={}){
 return{status,ok:status===200,async json(){
  if(brokenBody)throw Error("broken_server_json");
  return{candidates:[{finishReason,content:{parts:[{text}]}}]};
 }};
}
const good=returnedModel('{"image_type":"successful_transfer_receipt","amount_vnd":8000000,"amount_clear":true}');
assert.equal((await parseBillGeminiResponse(good)).amount_vnd,8000000);
assert.deepEqual(await parseBillGeminiResponse(returnedModel('```json\n{"amount_vnd":8000000}\n```')),
 {amount_vnd:8000000});
for(const broken of [
 returnedModel('{"amount_vnd":8000000'), // MAX_TOKENS / truncated
 returnedModel(''),returnedModel('{"amount_vnd":8000000} GARBAGE'),
 returnedModel('[]'),returnedModel('null'),returnedModel('{"amount_vnd":8000000}{"a":1}'),
 returnedModel('{"amount_vnd":8000000}',{brokenBody:true}),
 {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[]}}]})}
]){
 await assert.rejects(parseBillGeminiResponse(broken),/gemini_invalid_json/);
}
async function run(list,{abortAt=0}={}){
 const calls=[],logs=[],signal={aborted:false};
 let count=0;
 const result=await requestParsedBillGemini({
  key:"not-a-real-key",model:main,payload:base,signal,
  sleepFn:async()=>{if(abortAt)signal.aborted=true;},
  logFn:(type,info)=>logs.push({type,info}),
  fetchFn:async(url,options)=>{
   calls.push({url,options});
   if(abortAt===++count)signal.aborted=true;
   const response=list[count-1];
   if(!response)throw Error("unexpected_more_than_expected_calls");
   return response;
  }
 }).then(result=>({result})).catch(error=>({error}));
 return{...result,calls,logs,signal};
}
const one=await run([returnedModel('{"amount_vnd":8000000}')]);
assert.equal(one.calls.length,1);
assert.equal(one.result.parsed.amount_vnd,8000000);
assert.equal(one.result.modelRequestCount,1);
assert.equal(one.logs.filter(x=>x.type==="bank_bill_gemini_invalid_output").length,0);

const recovery=await run([
 returnedModel('{"amount_vnd":8000000',{finishReason:"MAX_TOKENS"}),
 returnedModel('{"amount_vnd":8000000,"image_type":"successful_transfer_receipt"}')
]);
assert.equal(recovery.calls.length,2);
assert.equal(recovery.result.usedModel,BILL_OCR_FALLBACK_MODEL);
assert.equal(recovery.result.modelRequestCount,2);
assert.equal(recovery.result.parsed.amount_vnd,8000000);
assert(recovery.calls[0].url.includes(main));
assert(recovery.calls[1].url.includes(BILL_OCR_FALLBACK_MODEL));
assert.strictEqual(recovery.calls[0].options.signal,recovery.calls[1].options.signal);
assert.equal(JSON.parse(recovery.calls[0].options.body).generationConfig.maxOutputTokens,1800);
assert(JSON.parse(recovery.calls[1].options.body).generationConfig.maxOutputTokens>=2048);
assert.equal(recovery.logs.filter(x=>x.type==="bank_bill_gemini_invalid_output").length,1);
assert(recovery.logs.every(x=>!JSON.stringify(x).includes("8000000")),
 "never expose customer financial contents in logs");
assert(recovery.calls.every(x=>x.options.headers["x-goog-api-key"]==="not-a-real-key"));

const malformedTwice=await run([
 returnedModel('{"amount_vnd":8000000'),returnedModel('{"amount_vnd":')
]);
assert.equal(malformedTwice.calls.length,2);
assert.equal(malformedTwice.error.message,"gemini_invalid_json");

const brokenServerEnvelope=await run([
 returnedModel('',{brokenBody:true}),returnedModel('{"amount_vnd":1234000}')
]);
assert.equal(brokenServerEnvelope.result.parsed.amount_vnd,1234000);
assert.equal(brokenServerEnvelope.calls.length,2);

const alreadyFallback=await run([
 {ok:false,status:503},returnedModel('{"bad":true',{finishReason:"MAX_TOKENS"})
]);
assert.equal(alreadyFallback.calls.length,2);
assert.equal(alreadyFallback.error.message,"gemini_invalid_json",
 "200 malformed after HTTP fallback waits for existing cron, never a third bonus model request");

const allCapacity=await run([
 {ok:false,status:503},{ok:false,status:503},returnedModel('{"bad":',{finishReason:"MAX_TOKENS"})
]);
assert.equal(allCapacity.calls.length,BILL_OCR_MAX_MODEL_REQUESTS);
assert.equal(allCapacity.error.message,"gemini_invalid_json");

const auth=await run([{ok:false,status:401},returnedModel('{"amount_vnd":8000000}')]);
assert.equal(auth.calls.length,1);
assert.equal(auth.error.message,"gemini_http_401");
const rate=await run([{ok:false,status:429},returnedModel('{"amount_vnd":8000000}')]);
assert.equal(rate.calls.length,1);
assert.equal(rate.error.message,"gemini_http_429");
const abort=await run([returnedModel('{"amount_vnd":8000000}')],{abortAt:1});
assert.equal(abort.error.message,"AbortError");
assert.equal(abort.calls.length,1);

const worker=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert(worker.includes("requestParsedBillGemini({"));
assert(worker.includes("signal:ctl.signal"));
assert(worker.includes("maxOutputTokens:1800"));
assert(!worker.includes("JSON.parse(resultString)"),"no unguarded raw Gemini JSON parse");
assert(worker.includes('db.rpc("chat_bank_app_collect"'),"bank collection remains a separate secured RPC");
const sql=readFileSync(new URL("../supabase/migrations/20261022213000_bank186_no_lost_bill_scan_and_admin_alert.sql",import.meta.url),"utf8");
assert(sql.includes("gemini_invalid_json"),"failed alternate remains compatible with 5m bounded DB retry");
console.log("BANK-303 malformed 200: same deadline, one alternate, cap three, cron retry and no financial guessing PASS");
