import assert from "node:assert/strict";
import {readV4Fields,requiredAutoCollectEvidence}
 from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {previewBillAppMatch}
 from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// BANK-294: a date is DAY [bounded letters/punctuation] MONTH [separator] YEAR.
// A clock is optional; no year/clock is ever borrowed from the Chat timestamp.
// These are normalized synthetic structures, never real customer transactions.
const base={
 image_type:"successful_transfer_receipt",image_layout:"app_screenshot",
 transaction_selection:"single_detail",transaction_nature:"transfer",
 transfer_success_visible:true,amount_clear:true,
 amount_role:"transfer_amount",amount_text:"VND 2,000,000",amount_vnd:2000000,
 recipient_name:"BUI XUAN TUNG",recipient_account_visible:"2901 1819 9999 9",
 recipient_account_last5:"99999",receiving_bank:"AGRIBANK",sending_bank:"TECHCOMBANK",
 transfer_content:"DINH THI TUYET chuyen tien",
 transaction_datetime_vn:"2026-11-12 09:17",transfer_date_vn:"2026-11-12",
 transfer_date_printed_vn:"12 thg 11, 2026",transfer_time_printed_vn:"9:17"
};
const read=(x,context={sentAt:"2026-11-12T02:30:00Z"})=>
 readV4Fields({...base,...x},context);
const variants=[
 "12/11/2026", "12.11.2026","12-11-2026","2026-11-12",
 "１２／１１／２０２６",
 "12 tháng 11 năm 2026","12 THÁNG 11, 2026","12 thang 11 2026",
 "12 thg 11, 2026","12 thg. 11, 2026",
 "12 Th. 11 năm 2026","12 th 11 2026","12 t 11, 2026",
 "Ngày thực hiện: 12 thg 11, 2026","Ngày giao dịch: 12 thg. 11, 2026",
 "12 thg 11, 2026 lúc 9:17",
 "Ngày thực hiện: 12 thg 11, 2026 lúc 9:17",
 "Ngày thực hiện: 12 Th. 11 năm 2026 lúc 9h17",
 "12 thg 11, 2026 9 giờ 17 phút",
 "12 thg 11, 2026, 09:17"
];
for(const printed of variants){
 const f=read({transfer_date_printed_vn:printed});
 assert.equal(f.transfer_date_vn,"2026-11-12",printed);
 assert.equal(f.transfer_at_vn,"2026-11-12 09:17",printed);
 assert.equal(f.printed_date_invalid,false,printed);
 assert.equal(f.time_date_conflict,false,printed);
 assert.equal(requiredAutoCollectEvidence(f).complete,true,printed);
}
// The date line can contain the ONLY visible clock. A missing model field is
// not invented: just use the actual 9:17 printed alongside the date.
for(const printed of [
 "12 thg 11, 2026 lúc 9:17",
 "12 thg 11, 2026 9h17",
 "Ngày thực hiện: 12 thg 11, 2026 9 giờ 17 phút"
]){
 const f=read({transfer_date_printed_vn:printed,
   transfer_time_printed_vn:null,transaction_datetime_vn:null});
 assert.equal(f.transfer_at_vn,"2026-11-12 09:17",printed);
 assert.equal(f.transfer_time_printed_vn?.includes("17"),true,printed);
 assert.equal(f.transaction_time_precision,"minute",printed);
 assert.equal(requiredAutoCollectEvidence(f).complete,true,printed);
}
// A date without a visible time is parsed as a date but NEVER assigned
// an artificial 00:00, Chat time or model-invented time.
const noClock=read({transfer_date_printed_vn:"12 thg 11, 2026",
 transfer_time_printed_vn:null,transaction_datetime_vn:null});
assert.equal(noClock.transfer_date_vn,"2026-11-12");
assert.equal(noClock.transfer_at_vn,null);
assert.equal(noClock.transfer_time_printed_vn,null);
assert.equal(requiredAutoCollectEvidence(noClock).complete,false);
assert.equal(requiredAutoCollectEvidence(noClock).reason,"bill_printed_time_missing");
// Precision: 9:17 is a minute; real printed seconds are preserved.
const seconds=read({transfer_date_printed_vn:"12 thg 11, 2026 lúc 9:17:34",
 transfer_time_printed_vn:"9:17",transaction_datetime_vn:"2026-11-12 09:17"});
assert.equal(seconds.transfer_at_vn,"2026-11-12 09:17:34");
assert.equal(seconds.transaction_time_precision,"second");
assert.equal(seconds.transfer_time_printed_vn,"9:17:34");
// Contradictions: model, separately printed, and inline clocks must agree.
for(const conflicting of [
 {transfer_date_printed_vn:"12 thg 11, 2026 lúc 9:18"},
 {transfer_date_printed_vn:"12 thg 11, 2026 lúc 9:17",
  transfer_time_printed_vn:"9:18"},
 {transfer_date_printed_vn:"12 thg 11, 2026 lúc 9:17:34",
  transfer_time_printed_vn:"9:17:35",transaction_datetime_vn:"2026-11-12 09:17:34"},
 {transfer_time_printed_vn:"9:18"}
]){
 const f=read(conflicting);
 assert.equal(f.time_date_conflict,true,JSON.stringify(conflicting));
 assert.equal(requiredAutoCollectEvidence(f).complete,false);
 assert.equal(requiredAutoCollectEvidence(f).reason,"bill_printed_datetime_conflict");
}
// Year missing, invalid calendar, or unknown word between day and month:
// the model MUST NOT silently complete them from a phone or push timestamp.
for(const bad of [
 "12 thg 11","12 thg 11 lúc 9:17","12 xyz 11, 2026",
 "12 txyz 11, 2026","12 giờ 11, 2026", "31 thg 02, 2026",
 "12 thg 13, 2026","00 thg 11, 2026","12 thg 11, 2026 lúc 25:17",
 "12 thg 11, 2026 lúc 9:99",
 "12 thg 11, 2026 và 13 thg 11, 2026"
]){
 const f=read({transfer_date_printed_vn:bad});
 assert.equal(f.printed_date_invalid,true,bad);
 assert.equal(requiredAutoCollectEvidence(f).complete,false,bad);
}
// If the AI swapped the normalized month/day, clear text beats model ISO;
// independent bank memo must still validate any automatic collection.
const swapped=read({transfer_date_printed_vn:"12 thg 11, 2026 lúc 9:17",
 transaction_datetime_vn:"2026-12-11 09:17",transfer_date_vn:"2026-12-11"});
assert.equal(swapped.transfer_at_vn,"2026-11-12 09:17");
assert.equal(swapped.ocr_date_normalization_corrected,true);
const credit={id:269,status:"credit_candidate",is_own_transfer:false,
 amount_vnd:2000000,package_name:"com.vnpay.Agribank3g",
 body:"Agribank: 09:17 12/11/2026 Tài khoản 2901181999999: +2,000,000VND. "+
 "Nội dung giao dịch: DINH THI TUYET chuyen tien. Số dư cuối: -139,114,730VND"};
const receipt={...swapped,media_asset_id:"synthetic-bank294",status:"amount_read",
 amount_vnd:2000000,sent_at:"2026-11-12T02:17:44Z",
 requires_bank_memo:true,ocr_date_normalization_corrected:true};
assert.equal(previewBillAppMatch(receipt,[credit],[],Date.parse("2026-11-12T02:22:00Z")).status,
 "candidate_unique");
assert.equal(previewBillAppMatch(receipt,[{...credit,
 body:credit.body.replace("DINH THI TUYET chuyen tien","UNKNOWN memo")}],[],
 Date.parse("2026-11-12T02:22:00Z")).status,"review");
assert.equal(previewBillAppMatch(receipt,[credit,{...credit,id:270}],[],
 Date.parse("2026-11-12T02:22:00Z")).status,"review");
console.log("BANK-294 Vietnamese day/text-separator/month and optional clock, fail-closed financial evidence PASS");
