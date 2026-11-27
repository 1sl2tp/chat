import assert from "node:assert/strict";
import {makeAccountRegionCache} from "../supabase/functions/v21-bank-bill-event/bill-account-region-cache.mjs";
import {parseBillGeminiResponse,requestParsedBillGemini} from "../supabase/functions/v21-bank-bill-event/bill-gemini-failover.mjs";
import {classifyAccountReadAnomaly,needsAccountDigitRecheck,resolveAccountDigitRecheck,validateAccountDigitProof,recoverSmallText} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {benchmarkProof} from "../supabase/functions/v21-bank-bill-event/bill-account-benchmark.mjs";
const region={role:"recipient_account",box:[400,150,500,850]},job={id:"fixture",lease_id:"lease",image_sha256:"a".repeat(64)};
let events=[],cancelled=false;
const slow={rpc:()=>({abortSignal(signal){return new Promise((_,reject)=>signal.addEventListener("abort",()=>{cancelled=true;reject(Error("cancelled"));},{once:true}));}})};
const cache=makeAccountRegionCache(slow,"benchmark",job,{timeoutMs:15,trace:e=>events.push(e.reason)});
assert.equal(await cache.get(),null);assert(cancelled);assert.deepEqual(events,["timeout"]);
assert.equal(await cache.put(region),false);assert.equal(await cache.remove(),false);
const hung=makeAccountRegionCache({rpc:()=>new Promise(()=>{})},"benchmark",job,{timeoutMs:15});
assert.equal(await hung.get(),null);
let calls=0;const parent=AbortSignal.abort();
assert.equal(await makeAccountRegionCache({rpc:()=>{calls++;}},"focused",job,{signal:parent}).get(),null);assert.equal(calls,0);
const response=(parts,finishReason,feedback)=>({ok:true,status:200,json:async()=>({promptFeedback:feedback,candidates:[{finishReason,content:{parts}}]})});
const part={text:'{"ok":true}'};
assert.deepEqual(await parseBillGeminiResponse(response([part],"STOP")),{ok:true});
assert.deepEqual(await parseBillGeminiResponse(response([part])),{ok:true});
assert.deepEqual(await parseBillGeminiResponse(response([{thought:true,text:"private reasoning"},part],"STOP")),{ok:true});
for(const reason of ["MAX_TOKENS","SAFETY","RECITATION","OTHER"])await assert.rejects(parseBillGeminiResponse(response([part],reason)),/gemini_invalid_json/);
await assert.rejects(parseBillGeminiResponse(response([part],"STOP",{blockReason:"SAFETY"})),/gemini_invalid_json/);
await assert.rejects(parseBillGeminiResponse(response([{thought:true,text:'{"ok":true}'}],"STOP")),/gemini_invalid_json/);
let ai=0;const parsed=await requestParsedBillGemini({key:"fixture",model:"gemini-3.5-flash-lite",payload:{},fetchFn:async()=>++ai===1?response([part],"MAX_TOKENS"):response([part],"STOP"),logFn:()=>{}});
assert.equal(ai,2);assert.equal(parsed.modelRequestCount,2);
const full="2901181999999",digits=[...full],proof={role:"recipient_account",clear:true,visible:full,digits,reverse_digits:[...digits].reverse(),digit_count:13,trailing_nines:6};
const raw={image_type:"successful_transfer_receipt",transfer_success_visible:true,transaction_selection:"single_detail",recipient_account_visible:full.slice(0,-1)};
assert.equal(classifyAccountReadAnomaly(raw),"known_missing_digit");
assert(needsAccountDigitRecheck(raw));assert.equal(resolveAccountDigitRecheck(raw,proof).second_visible,full);
for(const [value,reason] of [["","missing"],["123","short_or_other_account"],[full+"9","long_or_other_account"],["***9999","masked_or_unclear"],["abc","non_digit"],[full,"exact"],["1234567890123","different_account"]]){
 const next={...raw,recipient_account_visible:value};assert.equal(classifyAccountReadAnomaly(next),reason);assert.equal(needsAccountDigitRecheck(next),false);assert.equal(resolveAccountDigitRecheck(next,proof),null);
}
for(const invalid of [{...proof,clear:false},{...proof,role:"sender_account"},{...proof,reverse_digits:digits},{...proof,digit_count:12},{...proof,trailing_nines:5},{...proof,visible:full+"9"}]){
 assert.equal(validateAccountDigitProof(invalid),null);assert.equal(benchmarkProof(invalid),false);assert.equal(resolveAccountDigitRecheck(raw,invalid),null);
}
assert.equal(validateAccountDigitProof(proof),full);assert(benchmarkProof(proof));
const second={memo_clear:true,memo_lines:["a   b"," c\t d "]};
const memoRaw={...raw,transfer_content:""};
assert.equal(recoverSmallText(memoRaw,second).transfer_content,"a b c d");assert.equal(memoRaw.transfer_content,"");assert.deepEqual(second.memo_lines,["a   b"," c\t d "]);
console.log("BANK-01g: bounded cache, response integrity, anomaly taxonomy, memo normalization and shared proof passed.");
