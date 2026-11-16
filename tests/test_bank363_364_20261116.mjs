import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
// BANK-363: synthetic MCC sender + full transfer reference, no production data.
const memo="TRAN THI MINH chuyen tien";
const ref="FT26320118409908";
const bankHead="Agribank: 08:27 16/11/2026 Tài khoản 2901181999999: +454,000VND. Nội dung giao dịch: ";
const envelope=message=>"908473-"+message+";MCC;20261116082720;19033966381015;970407";
const bankTail=". Số dư cuối: -207,314,230VND";
const bill={media_asset_id:"synthetic-bank363",status:"amount_read",amount_vnd:454000,
 sent_at:"2026-11-16T01:27:31Z",transfer_at_vn:"2026-11-16 08:27:00",
 sender_name:"TRAN THI MINH",receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
 receiving_account:"290118199999",receiving_account_last5:"99999",
 transfer_content:memo,transfer_reference:ref,transaction_nature:"transfer",
 requires_bank_memo:true};
const credit={id:99912,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 is_own_transfer:false,amount_vnd:454000,body:bankHead+envelope(memo+" "+ref)+bankTail};
const now=Date.parse("2026-11-16T01:35:00Z");
const preview=(b=bill,c=credit)=>previewBillAppMatch(b,[c],[],now);
assert.equal(preview().status,"candidate_unique","exact MCC memo + matching FT suffix is eligible");
assert.equal(preview().notification_id,credit.id);
// All negative cases must remain fail closed.
for(const [label,b,c] of [
 ["missing receipt reference",{...bill,transfer_reference:null},credit],
 ["conflicting receipt reference",{...bill,transfer_reference:"FT26320118409909"},credit],
 ["different sender",{...bill,sender_name:"TRAN THI LAN"},credit],
 ["different memo",{...bill,transfer_content:"TRAN THI MINH thanh toan"},credit],
 ["bank different transfer reference",bill,{...credit,body:bankHead+envelope(memo+" FT26320118409909")+bankTail}],
 ["bank different minute",bill,{...credit,body:credit.body.replace("08:27 16/11/2026","08:32 16/11/2026")}],
 ["MCC envelope corrupt",bill,{...credit,body:credit.body.replace(";MCC;",";UNKNOWN;")}],
 ["account changed",bill,{...credit,body:credit.body.replace("Tài khoản 2901181999999","Tài khoản 2901181999998")}],
 ["amount changed",bill,{...credit,amount_vnd:454001}]
])assert.notEqual(preview(b,c).status,"candidate_unique",label);
assert.equal(preview(bill,{...credit,body:bankHead+envelope(memo)+bankTail}).status,
 "candidate_unique","legacy MCC with exact memo still works");
const sql=readFileSync(new URL("../supabase/migrations/20261116090000_bank364_transient_other_bill_scan_retry.sql",import.meta.url),"utf8");
assert.match(sql,/same_customer_peer_scan_pending/);
assert.match(sql,/pending\.status IN \('queued','scanning'\)/);
assert.match(sql,/pending\.customer_account_id=current_receipt\.customer_account_id/);
assert.match(sql,/pending\.sent_at BETWEEN current_receipt\.sent_at - interval '3 minutes'/);
assert.match(sql,/v_status='duplicate_or_ambiguous'/);
assert.match(sql,/v_outcome:='retry'/);
assert.match(sql,/v_outcome:='blocked'/);
assert.match(sql,/chat_bank_app_collect\(x\.media_asset_id,x\.notification_id\)/);
assert.match(sql,/pg_try_advisory_xact_lock\(17812094\)/);
assert.doesNotMatch(sql,/\b(?:insert|update|delete|truncate)\s+(?:into|from\s+)?public\.taphoa_debt_ledger/i);
assert.doesNotMatch(sql,/cron\.schedule\s*\(|\bgrant\s+execute\b/i);
console.log("BANK-363/364 strict FT suffix + transient cross-bill retry, no bypass of financial RPC PASS");
