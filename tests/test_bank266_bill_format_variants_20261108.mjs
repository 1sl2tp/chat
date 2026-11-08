import assert from "node:assert/strict";
import {readV4Fields,parseAmountText,validateVisionRead}
  from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {previewBillAppMatch}
  from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// BANK-266: These are FORMAT-only changes. No auto-collect approval is added.
for(const [input,amount] of [
 ["1.170.000 đ",1170000],["1,170,000 VND",1170000],
 ["1.170.000,00 VNĐ",1170000],["1,170,000.00 VND",1170000],
 ["1\u202f170\u202f000 ₫",1170000],
 ["-1.170.000đ",-1170000],["+1,170,000đ",1170000]
]) assert.equal(parseAmountText(input),amount, input);
for(const s of ["1.170.00", "1.170.000,50", "Số dư: 1.170.000",
 "1.170.000 và 40.000", "2901181999999", "0", "12,34,567"]){
 assert.equal(parseAmountText(s),null,"refuse ambiguous/not-a-transaction: "+s);
}
const modelBill=amount_text=>({
 image_type:"successful_transfer_receipt",transaction_nature:"transfer",
 transaction_selection:"single_detail",transfer_success_visible:true,
 amount_clear:true,amount_role:"transfer_amount",amount_text,
 amount_vnd:1170000
});
assert.equal(validateVisionRead(modelBill("1.170.000 đ")).status,"amount_read");
assert.equal(validateVisionRead({...modelBill("1.170.000 đ"),amount_vnd:117000}).status,"review");
assert.equal(validateVisionRead({...modelBill("1.170.000 đ"),amount_clear:false}).status,"review");
assert.equal(validateVisionRead({...modelBill("1.170.000 đ"),image_type:"multiple_transactions"}).status,"review");

for(const [raw,expected,precision] of [
 ["2026-11-08 11:45","2026-11-08 11:45","minute"],
 ["2026-11-08T11:45:35","2026-11-08 11:45:35","second"],
 ["2026/11/08 11:45","2026-11-08 11:45","minute"],
 ["08/11/2026 11:45","2026-11-08 11:45","minute"],
 ["8-11-2026 11:45","2026-11-08 11:45","minute"],
 ["11:45 08/11/2026","2026-11-08 11:45","minute"],
 ["11:45:35 08-11-2026","2026-11-08 11:45:35","second"]
]){
 const result=readV4Fields({transaction_datetime_vn:raw});
 assert.equal(result.transfer_at_vn,expected,raw);
 assert.equal(result.transaction_time_precision,precision,raw);
 assert.equal(result.transfer_date_vn,"2026-11-08",raw);
 assert.equal(result.time_date_conflict,false,raw);
}
for(const invalid of ["11:45","08/11","31/02/2026 11:45",
 "29/02/2025 11:45","08/11/2026 24:00","11:61 08/11/2026",
 "2026-11-08 11:45 UTC","2026-11-08 11:45+07:00"]){
 assert.equal(readV4Fields({transaction_datetime_vn:invalid}).transfer_at_vn,null,invalid);
}
assert.equal(readV4Fields({transaction_datetime_vn:null,transfer_date_vn:"08/11/2026"}).transfer_at_vn,null);
assert.equal(readV4Fields({transfer_date_vn:"08/11/2026"}).transfer_date_vn,"2026-11-08");
assert.equal(readV4Fields({transfer_date_vn:"8-11-2026"}).transfer_date_vn,"2026-11-08");
const mismatch=readV4Fields({transaction_datetime_vn:"08/11/2026 11:45",transfer_date_vn:"07/11/2026"});
assert.equal(mismatch.time_date_conflict,true);
assert.equal(mismatch.transfer_at_vn,null,"contradictory dates cannot authorize a credit");
assert.equal(mismatch.transfer_date_vn,null,"contradictory dates cannot authorize a credit");

for(const bank of ["Agribank","AGRI BANK",
 "Ngân hàng Nông nghiệp và Phát triển Nông thôn",
 "NH NN&PTNT Việt Nam","NHNN&PTNT","NH NN PTNT"]){
 assert.equal(readV4Fields({receiving_bank:bank}).receiving_bank,"AGRIBANK",bank);
}
assert.equal(readV4Fields({receiving_bank:"VPBank"}).receiving_bank,"VPBANK",
 "never infer receiving Agribank from a sending-app logo");
assert.equal(readV4Fields({sending_bank:"VPBank",receiving_bank:null}).receiving_bank,null);
assert.equal(readV4Fields({sender_name:null,recipient_name:"BÙI XUÂN TÙNG"}).sender_name,null);
const normalized=readV4Fields({
 recipient_name:"BÙI XUÂN TÙNG",sending_bank:"VPBANK",transaction_nature:"transfer",
 receiving_bank:"NH NN&PTNT Việt Nam",
 recipient_account_visible:"*****99999",recipient_account_last5:"99999",
 transaction_datetime_vn:"11:45 08/11/2026"
});
assert.equal(normalized.receiving_name,"BUI XUAN TUNG");
assert.equal(normalized.receiving_account_last5,"99999");
assert.equal(normalized.sending_bank,"VPBANK");

const candidate={media_asset_id:"test-bill",status:"amount_read",amount_vnd:1170000,
 sent_at:"2026-11-08T04:47:00Z",transaction_nature:"transfer",...normalized};
const credit={id:52,package_name:"com.vnpay.Agribank3g",
 status:"credit_candidate",amount_vnd:1170000,is_own_transfer:false,
 posted_at:"2026-11-08T04:50:00Z",
 body:"Agribank: 11:45 08/11/2026 Tài khoản 2901181999999: +1,170,000VND. Nội dung giao dịch: KH chuyen tien."};
const now=Date.parse("2026-11-08T05:00:00Z");
assert.equal(previewBillAppMatch(candidate,[credit],[],now).status,"candidate_unique");
assert.equal(previewBillAppMatch({...candidate,transfer_at_vn:null},[credit],[],now).status,"review");
assert.equal(previewBillAppMatch({...candidate,receiving_bank:"VPBANK"},[credit],[],now).status,"review");
assert.equal(previewBillAppMatch(candidate,[{...credit,amount_vnd:1160000}],[],now).status,"waiting_bank_event");
assert.equal(previewBillAppMatch(candidate,[credit,credit],[],now).status,"review");

console.log("BANK-266: multi-format bill recognition (amount, explicit VN time, beneficiary bank) PASS");
