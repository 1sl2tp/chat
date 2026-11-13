import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
import {readV4Fields} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {eligibleForPrintedDateRescan} from "../supabase/functions/v21-bank-bill-event/bill-review-recheck.mjs";
// BANK-347/348 regression: read-only synthetic data shaped like observed
// 13/11/2026 Agribank notices, never posts funds or sends customer messages.
const now=Date.parse("2026-11-13T14:40:00Z");
const bank296="Agribank: 21:08 13/11/2026 Tài khoản 2901181999999: +32,000VND. Nội dung giao dịch: QR - PHAM NGOC YEN NHI Chuyen tien. Số dư cuối: -26,108,730VND";
const bill={
 media_asset_id:"safe-demo-32k",status:"amount_read",amount_vnd:32000,
 sent_at:"2026-11-13T14:08:59Z",transfer_at_vn:"2026-11-13 21:08:00",
 receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
 receiving_account:"290118199999",receiving_account_last5:"99999",
 sender_name:"PHAM NGOC YEN NHI",sending_bank:"VIETINBANK",
 transfer_content:"CHUYEN TIEN",transaction_nature:"transfer",
 requires_bank_memo:true
};
const credit={id:296,status:"credit_candidate",package_name:"com.vnpay.Agribank3g",
 amount_vnd:32000,is_own_transfer:false,body:bank296};
const match=(b=bill,c=[credit],other=[])=>previewBillAppMatch(b,c,other,now);
const ok=match();
assert.equal(ok.status,"candidate_unique");
assert.equal(ok.notification_id,296);
assert.equal(ok.ledger_written,false);
assert.equal(ok.bank_confirmed,false);
for(const [name,changed] of [
 ["sender missing",{sender_name:null}],
 ["name abbreviated",{sender_name:"PHAM NGOC"}],
 ["different sender",{sender_name:"NGUYEN THI LAN"}],
 ["receiver is sender",{sender_name:"BUI XUAN TUNG"}],
 ["different amount",{amount_vnd:33000}],
 ["wrong bank",{receiving_bank:"TECHCOMBANK"}],
 ["missing receiving account",{receiving_account:null}],
 ["wrong receiving account",{receiving_account:"1234567899999"}],
 ["wrong suffix",{receiving_account_last5:"88888"}],
 ["wrong date",{transfer_at_vn:"2026-11-12 21:08:00"}],
 ["wrong minute",{transfer_at_vn:"2026-11-13 21:10:00"}],
 ["not a transfer",{transaction_nature:"interest"}],
 ["different memo",{transfer_content:"pay groceries"}]
])assert.notEqual(match({...bill,...changed}).status,"candidate_unique",name);
for(const [name,body] of [
 ["extra text",bank296.replace("Chuyen tien.","Chuyen tien THEM.")],
 ["different QR sender",bank296.replace("PHAM NGOC YEN NHI","PHAM NGOC YEN LAN")],
 ["no QR marker",bank296.replace("QR - ","")],
 ["wrong bank account",bank296.replace("Tài khoản 2901181999999","Tài khoản 2901181999998")],
 ["wrong bank date",bank296.replace("13/11/2026","12/11/2026")]
])assert.notEqual(match(bill,[{...credit,body}]).status,"candidate_unique",name);
assert.notEqual(match(bill,[credit,{...credit,id:999}]).status,"candidate_unique","bank proof not unique");
// BANK-348: extracted literal 'Ngày thực hiện' is authoritative; an ISO
// candidate alone or upload date must not justify a payment.
const basic={
 recipient_name:"BUI XUAN TUNG",recipient_account_visible:"2901 1819 9999 9",
 recipient_account_last5:"99999",receiving_bank:"AGRIBANK",
 sender_name:"PHAM THI THUY NGA",sending_bank:"TECHCOMBANK",
 transaction_datetime_vn:"2026-11-13 21:08",
 transfer_date_vn:"2026-11-13",transfer_time_printed_vn:"21:08",
 transfer_reference:"FT26317864081101",
 transfer_content:"PHAM THI THUY NGA chuyen tien"
};
for(const literal of ["Ngày thực hiện: 13/11/2026","13/11/2026",
 "Thời gian thực hiện: 21:08 | 13/11/2026",
 "Ngày thực hiện: Thứ Sáu, 13/11/2026",
 "Ngày thực hiện: 13/11/2026 - 21:08",
 "Ngày thực hiện: 13/11/2026 (21:08)",
 "13 thg 11, 2026","13 tháng 11 năm 2026"]){
 const extracted=readV4Fields({...basic,transfer_date_printed_vn:literal});
 assert.equal(extracted.transfer_date_vn,"2026-11-13",literal);
 assert.equal(extracted.transfer_at_vn,"2026-11-13 21:08",literal);
 assert.equal(extracted.printed_date_invalid,false,literal);
}
for(const invalidLiteral of ["Ngày hạch toán: 13/11/2026",
 "Ngày thực hiện: Thứ Năm, 13/11/2026",
 "Ngày thực hiện: 31/02/2026",
 "Ngày thực hiện: 13/11",
 "21:08 | 13/11/2026 | 14/11/2026"]){
 const data=readV4Fields({...basic,transfer_date_printed_vn:invalidLiteral});
 assert.equal(data.transfer_date_printed_vn,null,invalidLiteral);
 assert.equal(data.transfer_date_printed_raw_vn,invalidLiteral,
   "Never discard the original AI transcription even when rejected");
 assert.equal(data.printed_date_invalid,true,invalidLiteral);
}
const missing=readV4Fields({...basic,transfer_date_printed_vn:null});
assert.equal(missing.transfer_date_printed_vn,null,
 "Never fabricate literal date from bank notification or Chat upload");
const receipt={
 ledger_id:null,amount_vnd:119000,receiving_account:"2901181999999",
 receiving_bank:"AGRIBANK",transfer_at_vn:"2026-11-13 21:08:00",
 raw_read:{
  rule_version:"bank_bill_amount_v5_20261110",printed_date_invalid:true,
  transfer_date_printed_vn:null,transfer_date_vn:"2026-11-13",
  transfer_time_printed_vn:"21:08",time_date_conflict:false,
  clock_text_conflict:false,ocr_iso_date_conflict:false,
  image_type:"successful_transfer_receipt",transaction_nature:"transfer",
  transaction_selection:"single_detail",transfer_success_visible:true,
  amount_clear:true,transfer_content:"PHAM THI THUY NGA chuyen tien"
 }
};
const job={status:"review",reason:"bill_printed_datetime_conflict",
 sent_at:"2026-11-13T14:08:46.958Z",scanned_at:"2026-11-13T14:26:06.963Z",
 attempt_count:2};
assert.equal(eligibleForPrintedDateRescan(job,receipt,now),true);
assert.equal(eligibleForPrintedDateRescan({...job,attempt_count:3},receipt,now),false);
assert.equal(eligibleForPrintedDateRescan(job,{...receipt,ledger_id:888},now),false);
const index=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert.match(index,/const executionDateGuide=retryPrintedDate\?/);
assert.match(index,/Ngày thực hiện/);
assert.match(index,/transfer_date_printed_vn/);
assert.match(index,/const prompt=SYSTEM_PROMPT/);
assert.match(index,/db\.rpc\("chat_bank_app_collect"/);
console.log("BANK-347/348 PASS: strict QR sender, original printed date OCR, bounded retry, no financial shortcuts");