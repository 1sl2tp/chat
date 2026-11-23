import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planVerifiedNoClockRecovery} from "../supabase/functions/v21-bank-bill-event/bill-no-clock-recovery.mjs";

// BANK-364: synthetic evidence matching the two-image/no-clock failure mode.
// No production records, image downloads, messages, or ledger writes.
const now=Date.parse("2026-11-23T07:30:00Z"); // 14:30 in Viet Nam
const customer="example-customer";
const baseRaw={
 rule_version:"bank_bill_amount_v5_20261110",
 image_type:"successful_transfer_receipt",transfer_success_visible:true,
 amount_clear:true,transaction_selection:"single_detail",
 transaction_nature:"transfer",
 transfer_date_printed_vn:"23/11/2026",
 transfer_date_vn:"2026-11-23",
 transfer_time_printed_vn:null,
 recipient_account_last5:"99999",
 transfer_content:"HKD NGO VAN MANH chuyen tien",
 time_date_conflict:false,clock_text_conflict:false,
 printed_date_invalid:false,ocr_iso_date_conflict:false
};
const make=(id,patch={})=>({
 id,media_asset_id:"media-"+id,customer_account_id:customer,
 status:"review",reason:"bill_printed_time_missing",ledger_id:null,
 amount_vnd:1053000,receiving_account:"290118199999",
 receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
 sending_bank:"VPBank",transfer_reference:"NAPAS_INPLIBFTI2RNQE85",
 transfer_at_vn:null,sent_at:"2026-11-23T02:51:08Z",
 raw_read:{...baseRaw,sender_name:"HKD NGO VAN MANH"},
 ...patch
});
const original=make("original",{
 sent_at:"2026-11-23T02:51:03Z",
 raw_read:{...baseRaw,sender_name:null}
});
const good=make("paper");
const credit=(id=434,body="Agribank: 09:50 23/11/2026 Tài khoản 2901181999999: +1,053,000VND. Nội dung giao dịch: HKD NGO VAN MANH chuyen tien. Số dư cuối: -216,831,230VND")=>({
 id,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 is_own_transfer:false,amount_vnd:1053000,
 bank_credit_account:"2901181999999",
 // Arrival is later than the *independent* bank transaction clock.
 posted_at:"2026-11-23T02:57:39Z",body
});
const plan=(receipt=good,peers=[original,good],credits=[credit()],time=now)=>
 planVerifiedNoClockRecovery(receipt,peers,credits,time);
const ok=plan();
assert.equal(ok.status,"eligible");
assert.equal(ok.canonical_id,"paper"); // strongest OCR, not earliest upload
assert.equal(ok.bank_time_vn,"2026-11-23 09:50:00");
assert.equal(ok.notification_id,434);
assert.deepEqual(ok.duplicate_ids,["original"]);
assert.equal(plan(original).status,"defer_to_canonical");
assert.equal(good.raw_read.transfer_time_printed_vn,null,
 "Bank clock must NOT be rewritten as a printed image clock");
assert.equal(plan(good,[good]).status,"eligible",
 "A single verified bill can be considered without inventing a second image");
const mutations=[
 ["OCR wrong account",make("paper",{receiving_account:"290118199998"})],
 ["wrong recipient",make("paper",{receiving_name:"NGUYEN VAN KHAC"})],
 ["wrong sender",make("paper",{raw_read:{...baseRaw,sender_name:"NGUYEN VAN KHAC"}})],
 ["missing sender",make("paper",{raw_read:{...baseRaw,sender_name:null}})],
 ["wrong amount",make("paper",{amount_vnd:1054000})],
 ["other printed date",make("paper",{raw_read:{...baseRaw,transfer_date_printed_vn:"22/11/2026",sender_name:"HKD NGO VAN MANH"}})],
 ["AI datetime conflict",make("paper",{raw_read:{...baseRaw,clock_text_conflict:true,sender_name:"HKD NGO VAN MANH"}})],
 ["OCR invented time",make("paper",{raw_read:{...baseRaw,transfer_time_printed_vn:"09:51",sender_name:"HKD NGO VAN MANH"}})],
 ["not successful",make("paper",{raw_read:{...baseRaw,transfer_success_visible:false,sender_name:"HKD NGO VAN MANH"}})],
 ["old-day transfer",make("paper",{sent_at:"2026-11-22T02:51:08Z"})],
 ["already collected",make("paper",{status:"received",ledger_id:555})]
];
for(const [label,changed] of mutations){
 assert.notEqual(plan(changed,[changed,original]).status,"eligible",label);
}
for(const [label,bad] of [
 ["wrong bank minute",credit(434,credit().body.replace("09:50","09:34"))],
 ["wrong bank amount",credit(434,credit().body.replace("+1,053,000","+1,054,000"))],
 ["wrong bank destination",credit(434,credit().body.replace("2901181999999","2901181999988"))],
 ["wrong bank memo",credit(434,credit().body.replace("HKD NGO VAN MANH","HKD NGO VAN KHAC"))],
 ["missing bank time",credit(434,credit().body.replace("09:50 23/11/2026",""))],
 ["wrong bank day",credit(434,credit().body.replace("23/11/2026","22/11/2026"))],
 ["own transfer",{...credit(),is_own_transfer:true}]
]){
 assert.notEqual(plan(good,[original,good],[bad]).status,"eligible",label);
}
assert.notEqual(plan(good,[original,good],[credit(),credit(435)]).status,"eligible",
 "Two bank notices are not permission to consume either one");
assert.notEqual(plan(good,[original,good],[credit()],Date.parse("2026-11-24T02:00:00Z")).status,
 "eligible","No historic auto backfill on the following VN day");
const different=make("different",{transfer_reference:"NAPAS_UNRELATED_999999",
 raw_read:{...baseRaw,sender_name:"HKD NGO VAN MANH"}});
assert.deepEqual(plan(good,[good,different]).duplicate_ids,[],
 "An equal amount alone never proves duplicate transfer");
const conflict=make("conflict",{status:"amount_read"});
assert.notEqual(plan(good,[good,conflict]).status,"eligible",
 "A competing already-validated bill cannot be silently overwritten");
// Static ownership guard: recovered reviews never download a new image,
// call Gemini, or bypass the transactional financial writer.
const worker=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/bill-no-clock-worker.mjs",import.meta.url),"utf8");
const event=readFileSync(new URL("../supabase/functions/v21-agribank-notification-ingest/index.ts",import.meta.url),"utf8");
const owner=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert.doesNotMatch(worker,/\.storage\.from\(|requestParsedBillGemini|GEMINI_API_KEY/);
assert.match(worker,/db\.rpc\("chat_bank_app_collect"/);
assert.match(event,/bill_printed_time_missing/);
assert.match(owner,/recoverStoredNoClockBankCredit\(db,asset\)/);
console.log("BANK-364: 23 read-only no-clock/duplicate/bank-clock guards PASS");
