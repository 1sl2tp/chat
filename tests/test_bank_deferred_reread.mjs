import assert from "node:assert/strict";
import {deferredFields,displayEvidence,runDeferred,clockOnlyEligible,CLOCK_ONLY_PROMPT} from "../supabase/functions/v21-bank-bill-event/bill-deferred-reread.mjs";
const raw={image_type:"successful_transfer_receipt",transfer_success_visible:true,transaction_selection:"single_detail",transaction_nature:"transfer",recipient_account_visible:"290118199999",account_digit_recheck_state:"timeout"};
const full="2901181999999",digits=[...full],proof={role:"recipient_account",clear:true,visible:full,digits,reverse_digits:[...digits].reverse(),digit_count:13,trailing_nines:6};
assert.deepEqual(deferredFields(raw),["account"]);
assert.equal(displayEvidence(raw,"account",proof).account.second_visible,full);
assert.equal(displayEvidence(raw,"account",{...proof,clear:false}),null);
const job={raw,field:"account",image_sha256:"a".repeat(64),storage_key:"fixture",mime_type:"image/png"};
let calls=0,done=[];
const run=(digest,fetchFn)=>runDeferred({store:{claim:async()=>job,finish:async(j,v)=>done.push(v)},download:async()=>job.mime_type==="image/png"?new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]):new Uint8Array([255,216,255,224]),digest:async()=>digest,encode:()=>"AQ==",key:"fixture",fetchFn});
assert.equal((await run("b".repeat(64),async()=>{throw Error("must not call")})).state,"stale");
assert.equal((await run(job.image_sha256,async()=>{calls++;return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(proof)}]}}]})}})).state,"verified");
assert.equal(calls,1);
assert.equal(done.at(-1).evidence.account.second_visible,full);
assert.equal((await run(job.image_sha256,async()=>{calls++;return{ok:false,status:503}})).state,"retry");
assert.equal(calls,2);
assert.equal(done.at(-1).evidence,null);
console.log("Deferred focused display-only worker tests passed.");

job.mime_type="image/jpg";
assert.equal((await run(job.image_sha256,async(url,opts)=>{calls++;assert.equal(JSON.parse(opts.body).contents[0].parts[1].inlineData.mimeType,"image/jpeg");return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(proof)}]}}]})}})).state,"verified");
job.mime_type="image/svg+xml";
assert.equal((await run(job.image_sha256,async()=>{throw Error("must not call")})).state,"stale");
console.log("JPEG alias and unsupported MIME regression passed.");

const clockRaw={...raw,recipient_account_visible:full,transfer_date_printed_vn:"27/11/2026",transfer_date_vn:"2026-11-27",transfer_content:"fixture memo",small_text_recheck_state:"request_failed"};
assert.equal(clockOnlyEligible(clockRaw),true);
const clockProof={clear:true,source:"transaction_time_label",clock:"9:41"};
assert.deepEqual(displayEvidence(clockRaw,"small_text",clockProof),{clock:"09:41"});
for(const bad of [{...clockProof,clear:false},{...clockProof,source:"phone_status_bar"},{...clockProof,clock:"25:00"},{...clockProof,clock:"27/11/2026"},{...clockProof,clock:null}])assert.equal(displayEvidence(clockRaw,"small_text",bad),null);
assert.equal(clockOnlyEligible({...clockRaw,transfer_time_printed_vn:"09:41"}),false);
assert.equal(clockOnlyEligible({...clockRaw,transfer_content:""}),false);
assert.equal(clockOnlyEligible({...clockRaw,clock_text_conflict:true}),false);
job.raw=clockRaw;job.field="small_text";job.mime_type="image/jpeg";
assert.equal((await run(job.image_sha256,async(url,opts)=>{const body=JSON.parse(opts.body);assert.equal(body.contents[0].parts[0].text,CLOCK_ONLY_PROMPT);assert.equal(body.contents[0].parts[0].text.includes("09:41"),false);return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(clockProof)}]}}]})}})).state,"verified");
assert.deepEqual(done.at(-1).evidence,{clock:"09:41"});
console.log("Clock-only literal region and phone-clock rejection passed.");

for(const flag of ["time_date_conflict","clock_text_conflict","ocr_iso_date_conflict","printed_date_invalid","date_swap_suspected"]){
 for(const value of [true,"true"]){
  const conflict={...clockRaw,[flag]:value};
  assert.equal(clockOnlyEligible(conflict),false);
  assert.equal(displayEvidence(conflict,"small_text",{time_clear:true,transaction_line:"27/11/2026 09:41"}),null);
 }
}
console.log("Persisted date/clock conflict guards passed.");

const disagreeRaw={...raw,account_digit_recheck_state:"digit_evidence_disagrees"};
assert.deepEqual(deferredFields(disagreeRaw),["account"]);
assert.deepEqual(deferredFields({...disagreeRaw,recipient_account_visible:full}),[]);
assert.deepEqual(deferredFields({...disagreeRaw,image_type:"not_transfer_receipt"}),[]);
assert.deepEqual(deferredFields({...clockRaw,small_text_recheck_state:"digit_evidence_disagrees",account_digit_recheck_state:"not_required"}),[]);
job.raw=disagreeRaw;job.field="account";job.mime_type="image/jpeg";
let mismatchCalls=0;
const modelResponse=(p)=>({ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(p)}]}}]})});
assert.equal((await run(job.image_sha256,async(url,opts)=>{mismatchCalls++;assert.match(url,/models\/gemini-3\.5-flash:generateContent$/);const p=JSON.parse(opts.body).contents[0].parts[0].text;assert(!p.includes(full));return modelResponse(proof)})).state,"verified");
assert.equal(done.at(-1).evidence.account.second_visible,full);
assert.equal((await run(job.image_sha256,async()=>{mismatchCalls++;return modelResponse({...proof,reverse_digits:digits})})).state,"needs_review");
assert.equal(done.at(-1).evidence,null);assert.equal(mismatchCalls,2);
console.log("Disagreement recovery uses alternate vision, strict proof and one request per claim.");

// An OCR disagreement must not repeatedly use the same unverified box or cache.
// This header-only fixture deliberately makes the locator decline the region,
// so the bounded fallback can be tested without image codecs or real AI.
const jpegHeader=new Uint8Array([255,216,255,192,0,8,8,9,132,4,101,1,255,218]);
const regionHint={role:"recipient_account",box:[374,454,389,632]};
let relocalCalls=0,cacheCalls=0,finishCount=0;
const relocalJob={...job,mime_type:"image/jpeg",raw:{...disagreeRaw,recipient_account_region:regionHint},field:"account"};
const relocalResult=await runDeferred({
 store:{claim:async()=>relocalJob,finish:async(j,v)=>{finishCount++;assert.equal(v.state,"needs_review");assert.equal(v.evidence,null);}},
 download:async()=>jpegHeader,digest:async()=>relocalJob.image_sha256,encode:()=>"fixture",
 key:"fixture",makeRegionCache:()=>{cacheCalls++;throw Error("must not reuse cache after disagreement");},
 fetchFn:async(url,opts)=>{
   relocalCalls++;
   const payload=JSON.parse(opts.body);
   assert(!opts.body.includes(full));
   if(relocalCalls===1){
    assert(payload.generationConfig.responseJsonSchema);
    return modelResponse({role:"unknown",box:[]});
   }
   assert.equal(relocalCalls,2);assert.ok(url.endsWith("/models/gemini-3.5-flash:generateContent"));
   assert.equal(payload.contents[0].parts.length,2);
   return modelResponse({...proof,reverse_digits:digits});
 }
});
assert.equal(relocalResult.state,"needs_review");assert.equal(relocalResult.ledger_written,false);
assert.equal(relocalCalls,2);assert.equal(cacheCalls,0);assert.equal(finishCount,1);
console.log("Disagreement re-localizes without unverified hint/cache, bounded original fallback.");
