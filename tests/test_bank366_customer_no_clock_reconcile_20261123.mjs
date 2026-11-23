import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planMissingClockCustomerNotice,noClockNoticeClientId}
 from "../supabase/functions/v21-bank-bill-event/bill-no-clock-customer-notice.mjs";
// BANK-366: synthetic pure regression, no messages, transfers, production data.
const customer="70df2da0-f0da-43a4-b0ff-af0b79f1d1f6";
const make=(ref,amount,sender,more={})=>({
 id:"1e001122-3344-4555-a666-777788889999",
 customer_account_id:customer,
 status:"review",reason:"bill_printed_time_missing",ledger_id:null,
 amount_vnd:amount,receiving_name:"BUI XUAN TUNG",
 receiving_bank:"AGRIBANK",receiving_account:"290118199999",
 transfer_reference:ref,transfer_at_vn:null,
 raw_read:{
  rule_version:"bank_bill_amount_v5_20261110",
  image_type:"successful_transfer_receipt",transfer_success_visible:true,
  amount_clear:true,transaction_selection:"single_detail",
  transaction_nature:"transfer",transfer_date_vn:"2026-11-23",
  transfer_date_printed_vn:"23/11/2026",transfer_time_printed_vn:null,
  missing_fields:["transaction_clock"],
  transfer_content:sender+" chuyen tien",sender_name:sender,
  uncertainty:"",
  ...more.raw_read
 },
 ...Object.fromEntries(Object.entries(more).filter(([k])=>k!=="raw_read"))
});
const paper=make("NAPAS_INPLIBFTI2R6F6IJ",1102000,"LAI THI THU HOA",{
 raw_read:{uncertainty:"Thời gian chỉ có ngày không có giờ, mã tham chiếu bị xuống dòng."}
});
const paired=make("NAPAS_INPLIBFTI2RNQE85",1053000,"HKD NGO VAN MANH");
const a=planMissingClockCustomerNotice(paper);
assert(a);
assert(a.body.includes("1.102.000đ")&&a.body.includes("23/11/2026")&&
 a.body.includes("HH:mm")&&a.body.includes("Không cần chuyển khoản thêm"));
assert(!a.body.includes("CHƯA GHI THU"),"Do not assert unverified global ledger");
assert(planMissingClockCustomerNotice(paired));
const sameCrop=make("NAPAS_INPLIBFTI2R6F6IJ",1102000,"LAI THI THU HOA");
assert.equal(planMissingClockCustomerNotice(sameCrop).identity,a.identity);
assert.equal(await noClockNoticeClientId(customer,a.identity),
 await noClockNoticeClientId(customer,planMissingClockCustomerNotice(sameCrop).identity),
 "Different image hashes of the same bank transfer must share ONE Chat message");
assert.notEqual(await noClockNoticeClientId(customer,a.identity),
 await noClockNoticeClientId(customer,planMissingClockCustomerNotice(paired).identity),
 "Different bank transfers need separate reconciliation requests");
for(const [label, changed] of [
 ["Already collected",{status:"received",ledger_id:1188}],
 ["Manual reviewed",{reason:"bill_printed_datetime_invalid"}],
 ["not a transfer",{raw_read:{transaction_nature:"fee_or_adjustment"}}],
 ["Unreadable amount",{raw_read:{amount_clear:false}}],
 ["No visible date",{raw_read:{transfer_date_printed_vn:null}}],
 ["No literal clock but uncertain blur",{raw_read:{uncertainty:"Không rõ giờ vì ảnh bị mờ"}}],
 ["Clock is actually printed",{raw_read:{transfer_time_printed_vn:"14:56"}}],
 ["OCR conflicting",{raw_read:{time_date_conflict:true}}],
 ["Missing explicit clock label",{raw_read:{missing_fields:[]}}],
 ["Wrong receiver account",{receiving_account:"99988888"}],
 ["Wrong receiver name",{receiving_name:"NGUYEN VAN AN"}],
 ["Impossible printed date",{raw_read:{transfer_date_vn:"2026-11-31",transfer_date_printed_vn:"31/11/2026"}}],
 ["No memo",{raw_read:{transfer_content:""}}],
 ["No identifiable customer",{customer_account_id:null}]
]){
 const r=make("NAPAS_INPLIBFTI2R6F6IJ",1102000,"LAI THI THU HOA",changed);
 assert.equal(planMissingClockCustomerNotice(r),null,label);
}
// No second notifications and no money mutation. Existing RPC validates
// global/per-customer opt-in and enforces client-id uniqueness.
const worker=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/bill-no-clock-customer-notice.mjs",import.meta.url),"utf8");
const owner=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert.match(worker,/db\.rpc\("taphoa_chat_notify_customer"/);
assert.match(worker,/customer_notified_at/);
assert.doesNotMatch(worker,/taphoa_debt_ledger|chat_bank_app_collect|\.storage\.from\(|requestParsedBillGemini|GEMINI_API_KEY/);
assert.match(owner,/sendMissingClockCustomerReconciliation\(db,asset\)/);
console.log("BANK-366: no-clock customer reconciliation request and dedup PASS");
