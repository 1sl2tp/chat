import assert from "node:assert/strict";
import {deferredFields,displayEvidence,runDeferred,clockOnlyEligible,CLOCK_ONLY_PROMPT} from "../supabase/functions/v21-bank-bill-event/bill-deferred-reread.mjs";
const raw={image_type:"successful_transfer_receipt",transfer_success_visible:true,transaction_selection:"single_detail",transaction_nature:"transfer",recipient_account_visible:"290118199999",account_digit_recheck_state:"timeout"};
const full="2901181999999",digits=[...full],proof={role:"recipient_account",clear:true,visible:full,digits,reverse_digits:[...digits].reverse(),digit_count:13,trailing_nines:6};
assert.deepEqual(deferredFields(raw),["account"]);
assert.equal(displayEvidence(raw,"account",proof).account.second_visible,full);
assert.equal(displayEvidence(raw,"account",{...proof,clear:false}),null);
const job={raw,field:"account",image_sha256:"a".repeat(64),storage_key:"fixture",mime_type:"image/png"};
let calls=0,done=[];
const run=(digest,fetchFn)=>runDeferred({store:{claim:async()=>job,finish:async(j,v)=>done.push(v)},download:async()=>new Uint8Array([1]),digest:async()=>digest,encode:()=>"AQ==",key:"fixture",fetchFn});
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
