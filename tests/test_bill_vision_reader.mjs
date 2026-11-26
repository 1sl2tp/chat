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
