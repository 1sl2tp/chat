import assert from "node:assert/strict";
import {readV4Fields,validateVisionRead,requiredAutoCollectEvidence,classifyBillRecognition}
 from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {previewBillAppMatch}
 from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// BANK-291: Techcombank prints "12 tháng 11, 2026 lúc 9:17".
// No account/chat upload time is used to invent the transaction date.
const raw={
 image_type:"successful_transfer_receipt",image_layout:"app_screenshot",
 transaction_selection:"single_detail",transaction_nature:"transfer",
 transfer_success_visible:true,amount_clear:true,
 amount_role:"transfer_amount",amount_text:"VND 2,000,000",amount_vnd:2000000,
 recipient_name:"BUI XUAN TUNG",recipient_account_visible:"2901 1819 9999 9",
 recipient_account_last5:"99999",receiving_bank:"AGRIBANK",sending_bank:"TECHCOMBANK",
 sender_name:"DINH THI TUYET",transfer_content:"DINH THI TUYET chuyen tien",
 transaction_datetime_vn:"2026-11-12 09:17",transfer_date_vn:"2026-11-12",
 transfer_date_printed_vn:"12 tháng 11, 2026",transfer_time_printed_vn:"9:17"
};
const read=(input,context={sentAt:"2026-11-12T02:17:44Z"})=>
 readV4Fields(input,context);
const fields=read(raw);
assert.equal(fields.transfer_date_vn,"2026-11-12");
assert.equal(fields.transfer_at_vn,"2026-11-12 09:17");
assert.equal(fields.printed_date_invalid,false);
assert.equal(fields.time_date_conflict,false);
assert.equal(fields.transfer_date_printed_vn,"12 tháng 11, 2026");
assert.equal(fields.receiving_account,"2901181999999");
assert.equal(fields.transfer_time_printed_vn,"9:17");
assert.equal(validateVisionRead(raw).status,"amount_read");
assert.deepEqual(requiredAutoCollectEvidence(fields),
 {complete:true,reason:null,requires_bank_memo:false});
assert.deepEqual(classifyBillRecognition(raw,fields,validateVisionRead(raw)).missing_fields,[]);

for(const printed of ["12 tháng 11 năm 2026","12 tháng 11, 2026",
 "Ngày thực hiện: 12 tháng 11, 2026","12 THÁNG 11, 2026"]){
 const result=read({...raw,transfer_date_printed_vn:printed});
 assert.equal(result.transfer_at_vn,"2026-11-12 09:17",printed);
 assert.equal(requiredAutoCollectEvidence(result).complete,true,printed);
}
for(const bad of ["31 tháng 02, 2026","12 tháng 13, 2026","12 tháng 11",
 "12 tháng 11, 2027","12 tháng 11, 2026 thêm dữ liệu",
 "12 tháng 11, 2026 lúc 8:17","12 tháng 11, 2026; 13 tháng 11, 2026"]){
 const result=read({...raw,transfer_date_printed_vn:bad});
 assert.equal(requiredAutoCollectEvidence(result).complete,false,bad);
 assert.equal(requiredAutoCollectEvidence(result).reason,"bill_printed_datetime_conflict",bad);
}
// If the ISO calendar differs, the literal text and clock must be authoritative
// but the independent bank memo is mandatory.
const swapped=read({...raw,transaction_datetime_vn:"2026-12-11 09:17",transfer_date_vn:"2026-12-11"});
assert.equal(swapped.transfer_at_vn,"2026-11-12 09:17");
assert.equal(swapped.ocr_date_normalization_corrected,true);
assert.equal(requiredAutoCollectEvidence(swapped).requires_bank_memo,true);
const withoutDate=read({...raw,transfer_date_printed_vn:null});
assert.equal(requiredAutoCollectEvidence(withoutDate).requires_bank_memo,true);
const withoutClock=read({...raw,transfer_time_printed_vn:null});
assert.equal(requiredAutoCollectEvidence(withoutClock).complete,false);

const credit={
 id:269,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 is_own_transfer:false,amount_vnd:2000000,
 body:"Agribank: 09:17 12/11/2026 Tài khoản 2901181999999: +2,000,000VND. "+
  "Nội dung giao dịch: DINH THI TUYET chuyen tien. Số dư cuối: -139,114,730VND"
};
const receipt={...fields,media_asset_id:"synthetic-bank291",status:"amount_read",
 amount_vnd:2000000,sent_at:"2026-11-12T02:17:44Z",requires_bank_memo:false};
const now=Date.parse("2026-11-12T02:26:00Z");
const matched=previewBillAppMatch(receipt,[credit],[],now);
assert.equal(matched.status,"candidate_unique",JSON.stringify(matched));
assert.equal(matched.notification_id,269);
assert.equal(matched.ledger_written,false,"preview never posts a financial transaction");
assert.equal(previewBillAppMatch(receipt,[credit,{...credit,id:270}],[],now).status,"review");
assert.notEqual(previewBillAppMatch(receipt,[{...credit,amount_vnd:2001000}],[],now).status,"candidate_unique");
assert.notEqual(previewBillAppMatch(receipt,[{...credit,
 body:credit.body.replace("09:17","09:20")}],[],now).status,"candidate_unique");
assert.equal(requiredAutoCollectEvidence(read({...raw,recipient_account_visible:"1234567899999"})).complete,false);
console.log("BANK-291 Techcombank comma-date + unique official Agribank 09:17 proof PASS");
