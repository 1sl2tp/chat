import assert from "node:assert/strict";
import {buildBillVisionPrompt,normalizeVisionMemo} from "../supabase/functions/v21-bank-bill-event/bill-vision-reader.mjs";
import {readV4Fields,requiredAutoCollectEvidence,revalidateAuditedAccountRead} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
assert.match(buildBillVisionPrompt("existing schema","ten fields"),/VietinBank/);
const raw={transfer_content:"Chuyen tien",memo_lines:["NGUYEN VAN MAU","Chuyen tien"],sender_name:"TEN NGOAI O"};
const v=normalizeVisionMemo(raw);
assert.equal(v.transfer_content,"NGUYEN VAN MAU Chuyen tien");assert.equal(v.memo_raw,"Chuyen tien");
assert.deepEqual(v.memo_lines,raw.memo_lines);
assert.equal(normalizeVisionMemo({transfer_content:"Chuyen tien",sender_name:"TEN NGOAI O"}).transfer_content,"Chuyen tien");
assert.equal(normalizeVisionMemo({transfer_content:"A",memo_lines:["B"]}).transfer_content,"A");
assert.equal(normalizeVisionMemo({transfer_content:"A\nB"}).transfer_content,"A B");
assert.equal(normalizeVisionMemo({transfer_content:null,memo_lines:["A","B"]}).transfer_content,"A B");
assert.equal(readV4Fields(v).transfer_content,"NGUYEN VAN MAU Chuyen tien");
assert.equal(requiredAutoCollectEvidence(readV4Fields(v)).complete,false);
console.log("Canonical reader and two-line memo synthetic fixtures passed");

const expectedAccount="2901181999999";
const original=expectedAccount+" •";
const now=Date.parse("2026-11-26T10:00:00Z");
const row={
 status:"review",reason:"bill_recipient_account_normalized_pending_bank_review",ledger_id:null,
 receiving_account:expectedAccount,receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
 amount_vnd:123000,transfer_at_vn:"2026-11-26T16:41:00",sent_at:"2026-11-26T09:42:00Z",
 raw_read:{rule_version:"bank_bill_amount_v5_20261110",transfer_success_visible:true,amount_clear:true,
 transaction_selection:"single_detail",transaction_nature:"transfer",
 account_normalization_audit:{rule:"trailing_bullet_v1",source:"stored_ai_output_no_rescan",normalized:expectedAccount,original},
 recipient_account_visible:original,manual_review_reason:"bill_recipient_account_missing",
 missing_fields:["recipient_account"],time_date_conflict:false,clock_text_conflict:false,printed_date_invalid:false,
 transfer_content:"NGUYEN VAN MAU Chuyen tien",transaction_datetime_vn:"2026-11-26 16:41",
 transfer_date_vn:"2026-11-26",transfer_date_printed_vn:"26/11/2026",transfer_time_printed_vn:"16:41",
 bill_fields_v1:{recipient_account:original,transfer_content:"NGUYEN VAN MAU Chuyen tien"},
 match_preview:{status:"review",reason:"bill_recipient_account_missing"}}
};
const repaired=revalidateAuditedAccountRead(row,now);
assert.ok(repaired);
assert.equal(repaired.required_fields_complete,true);
assert.equal(repaired.requires_bank_memo,true);
assert.equal(repaired.recipient_account_visible,expectedAccount);
assert.equal(repaired.bill_fields_v1.recipient_account,expectedAccount);
assert.equal(repaired.match_preview,undefined);
assert.equal(repaired.evidence_revalidation_audit.previous_preview.status,"review");
assert.equal(row.raw_read.recipient_account_visible,original);
for(const override of [{status:"received"},{ledger_id:1},{receiving_account:"2901181999998"},{sent_at:"2026-11-25T09:42:00Z"}]){
 assert.equal(revalidateAuditedAccountRead({...row,...override},now),null);
}
for(const override of [{missing_fields:["recipient_account","transaction_clock"]},{transfer_time_printed_vn:null},{time_date_conflict:true},{transfer_content:"Chuyen tien"},{recipient_account_visible:"290118199999 •"},{account_normalization_audit:{...row.raw_read.account_normalization_audit,original:"290118199999 •"}}]){
 assert.equal(revalidateAuditedAccountRead({...row,raw_read:{...row.raw_read,...override}},now),null);
}
assert.equal(revalidateAuditedAccountRead(row,now+86400000),null);
console.log("Audited literal account evidence revalidation fixtures passed");

import {prepareVerifiedCorrection} from "../supabase/functions/v21-bank-bill-event/bill-correction-projection.mjs";
const correctionNow=Date.parse("2026-11-26T10:00:00Z");
const correctionRow={id:"fixture-receipt",media_asset_id:"fixture-asset",image_sha256:"a".repeat(64),
 status:"review",ledger_id:null,duplicate_of:null,sent_at:"2026-11-26T09:42:00Z",
 raw_read:{manual_review_reason:"bill_recipient_account_missing",match_preview:{status:"candidate_unique",notification_id:123}}};
const reread={source:"original_image_worker",reader_version:"regional-bill-v1",receipt_id:correctionRow.id,
 asset_id:correctionRow.media_asset_id,image_sha256:correctionRow.image_sha256,model:"fixture-model",
 completed_at:"2026-11-26T09:59:00Z",parsed:{
 image_type:"successful_transfer_receipt",image_layout:"app_screenshot",transaction_selection:"single_detail",
 transaction_nature:"transfer",transfer_success_visible:true,amount_role:"transfer_amount",
 amount_text:"123,000 VND",amount_vnd:123000,amount_clear:true,
 recipient_name:"BUI XUAN TUNG",recipient_account_visible:"2901181999999",
 receiving_bank:"AGRIBANK",sending_bank:"VIETINBANK",
 transaction_datetime_vn:"2026-11-26 16:41",transfer_date_vn:"2026-11-26",
 transfer_date_printed_vn:"26/11/2026",transfer_time_printed_vn:"16:41",
 transfer_content:"NGUYEN VAN MAU Chuyen tien",transfer_reference:"FIXTURE123"}};
const projection=prepareVerifiedCorrection(correctionRow,reread,correctionNow);
assert.equal(projection.ok,true,projection.reason);
assert.equal(projection.patch.status,"amount_read");
assert.equal(projection.patch.amount_vnd,123000);
assert.equal(projection.patch.raw_read.requires_bank_memo,true);
assert.equal(projection.patch.raw_read.match_preview,undefined);
assert.equal(projection.patch.raw_read.manual_review_reason,null);
assert.equal(projection.ledger_written,false);
assert.equal(projection.recheck_required,true);
assert.equal(correctionRow.raw_read.match_preview.notification_id,123);
for(const changes of [{status:"received"},{ledger_id:1},{duplicate_of:"other"},{status:"duplicate"},{sent_at:"2026-11-25T09:42:00Z"}]){
 assert.equal(prepareVerifiedCorrection({...correctionRow,...changes},reread,correctionNow).ok,false);
}
for(const changes of [{source:"browser_annotation"},{receipt_id:"other"},{image_sha256:"b".repeat(64)},{completed_at:"2026-11-26T09:50:00Z"}]){
 assert.equal(prepareVerifiedCorrection(correctionRow,{...reread,...changes},correctionNow).ok,false);
}
for(const changes of [{amount_vnd:125000},{recipient_account_visible:"2901181999998"},{recipient_name:"OTHER"},
 {transfer_time_printed_vn:null},{transfer_date_printed_vn:"25/11/2026"},{transfer_content:"Chuyen tien"},
 {transfer_content:"NGUYEN VAN MAU Chuyen tien",memo_lines:["OTHER CONTENT"]}]){
 assert.equal(prepareVerifiedCorrection(correctionRow,{...reread,parsed:{...reread.parsed,...changes}},correctionNow).ok,false,JSON.stringify(changes));
}
console.log("Verified correction projection fixtures passed");
