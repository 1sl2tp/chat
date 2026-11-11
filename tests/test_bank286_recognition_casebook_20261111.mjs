import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SYSTEM_PROMPT,parseAmountText,readV4Fields,validateVisionRead,
  requiredAutoCollectEvidence,classifyBillRecognition}
  from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {previewBillAppMatch}
  from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// Synthetic, anonymized canonical examples. Never learn from an unverified
// customer receipt by copying names/accounts into prompt or changing debt.
const base={
 image_type:"successful_transfer_receipt",image_layout:"app_screenshot",
 transaction_selection:"single_detail",transaction_nature:"transfer",
 transfer_success_visible:true,amount_clear:true,amount_role:"sender_debit",
 amount_text:"-850.000đ",amount_vnd:850000,
 recipient_name:"BUI XUAN TUNG",recipient_account_visible:"2901181999999",
 recipient_account_last5:"99999",receiving_bank:"AGRIBANK",
 sender_name:"CUSTOMER A",transaction_datetime_vn:"2026-11-11 08:25",
 transfer_date_vn:"2026-11-11",transfer_date_printed_vn:"11/11/2026",
 transfer_time_printed_vn:"08:25",transfer_content:"CUSTOMER A chuyen tien",
 transfer_reference:"FT2026111108250001"
};
const read=x=>readV4Fields(x,{sentAt:"2026-11-11T01:30:00Z"});
const v=validateVisionRead(base);
assert.equal(v.status,"amount_read");
assert.equal(classifyBillRecognition(base,read(base),v).recognition_case,"complete_receipt");
assert.deepEqual(classifyBillRecognition(base,read(base),v).missing_fields,[]);
assert.equal(classifyBillRecognition(base,read(base),v).image_layout,"app_screenshot");
assert.equal(requiredAutoCollectEvidence(read(base)).requires_bank_memo,false);

const variants=[
 {label:"share sheet",date:"Ngày: 11/11/2026",clock:"08:25",layout:"shared_receipt"},
 {label:"printed paper",date:"11.11.2026",clock:"8h25",layout:"paper_photo"},
 {label:"rotated receipt",date:"11-11-2026",clock:"08 giờ 25",layout:"rotated_photo"},
 {label:"verbose bank date",date:"11 tháng 11 năm 2026",clock:"Lúc 8:25",layout:"app_screenshot"},
 {label:"ISO date",date:"2026/11/11",clock:"08:25:36",layout:"app_screenshot"}
];
for(const c of variants){
 const parsed={...base,image_layout:c.layout,transaction_datetime_vn:null,
  transfer_date_printed_vn:c.date,transfer_time_printed_vn:c.clock};
 const fields=read(parsed);
 assert.equal(fields.transfer_date_vn,"2026-11-11",c.label);
 assert.equal(fields.transfer_at_vn,"2026-11-11 08:25"+(c.clock.includes(":36")?":36":""),c.label);
 assert.equal(requiredAutoCollectEvidence(fields).complete,true,c.label);
 assert.equal(classifyBillRecognition(parsed,fields,v).image_layout,c.layout,c.label);
}
for(const amount of ["850.000 ₫","850,000 VND","850 000 đ",
 "850.000,00 VNĐ","850,000.00 VND"])
 assert.equal(parseAmountText(amount),850000,amount);
for(const bad of ["850.0","850.000,50","số dư 850.000","2901181999999"])
 assert.equal(parseAmountText(bad),null,bad);

const missingClock=read({...base,image_layout:"paper_photo",transfer_time_printed_vn:null,
 transaction_datetime_vn:null});
assert.equal(requiredAutoCollectEvidence(missingClock).complete,false);
assert.equal(requiredAutoCollectEvidence(missingClock).reason,"bill_printed_time_missing");
assert.equal(classifyBillRecognition(base,missingClock,v).recognition_case,"no_printed_clock");
const missingDate=read({...base,transfer_date_printed_vn:null});
assert.equal(classifyBillRecognition(base,missingDate,v).recognition_case,"unverified_printed_date");
assert.ok(classifyBillRecognition(base,missingDate,v).missing_fields.includes("literal_date"));
assert.equal(requiredAutoCollectEvidence(missingDate).requires_bank_memo,true,
 "missing literal date can only be reconciled by unique official credit + exact memo");
const cropped=read({...base,recipient_account_visible:"290118199999"});
assert.equal(classifyBillRecognition(base,cropped,v).recognition_case,"cropped_recipient");
assert.equal(requiredAutoCollectEvidence(cropped).requires_bank_memo,true);
assert.equal(requiredAutoCollectEvidence(read({...base,recipient_account_visible:null,
 recipient_account_last5:null})).reason,"bill_recipient_account_missing");
assert.equal(requiredAutoCollectEvidence(read({...base,recipient_account_visible:"1234567899999"}))
 .reason,"bill_recipient_account_conflict");

const swap=read({...base,transaction_datetime_vn:"2026-10-11 08:25",
 transfer_date_vn:"2026-10-11"});
assert.equal(swap.transfer_at_vn,"2026-11-11 08:25");
assert.equal(swap.ocr_date_normalization_corrected,true);
const contradiction=read({...base,transfer_time_printed_vn:"08:26"});
assert.equal(contradiction.time_date_conflict,true);
assert.equal(requiredAutoCollectEvidence(contradiction).complete,false);
const invalid=read({...base,transfer_date_printed_vn:"31/02/2026"});
assert.equal(invalid.printed_date_invalid,true);
assert.equal(requiredAutoCollectEvidence(invalid).complete,false);
const noYear=read({...base,transfer_date_vn:null,transaction_datetime_vn:null,
 transfer_date_printed_vn:"11/11",transfer_time_printed_vn:"08:25"});
assert.equal(noYear.transfer_at_vn,null,"never borrow year from uploaded time");

for(const layout of ["transaction_history","collage"]){
 const multi={...base,image_layout:layout,image_type:"multiple_transactions",
  transaction_selection:"unclear"};
 const verdict=validateVisionRead(multi);
 assert.equal(verdict.status,"review");
 assert.equal(classifyBillRecognition(multi,read(multi),verdict).recognition_case,
   "multiple_transactions");
}
assert.equal(validateVisionRead({...base,amount_role:"incoming_credit"}).status,"review");
assert.equal(validateVisionRead({...base,amount_clear:false}).status,"review");
assert.equal(classifyBillRecognition({...base,image_layout:"arbitrary"},
 read(base),v).image_layout,"unknown");

const bank={id:286,package_name:"com.vnpay.Agribank3g",
 status:"credit_candidate",is_own_transfer:false,amount_vnd:850000,
 body:"Agribank: 08:25 11/11/2026 Tài khoản 2901181999999: +850,000VND. "+ 
  "Nội dung giao dịch: CUSTOMER A chuyen tien. Số dư cuối: 99,000,000"};
const candidate={...cropped,media_asset_id:"synthetic-crop",status:"amount_read",
 sent_at:"2026-11-11T01:30:00Z",amount_vnd:850000,
 requires_bank_memo:true,transaction_nature:"transfer"};
assert.equal(previewBillAppMatch(candidate,[bank],[],Date.parse("2026-11-11T02:00:00Z")).status,
 "candidate_unique","unique bank credit, memo and cropped-account proof");
assert.equal(previewBillAppMatch({...candidate,transfer_content:"WRONG CONTENT"},
 [bank],[],Date.parse("2026-11-11T02:00:00Z")).status,"review");
assert.equal(previewBillAppMatch(candidate,[bank,{...bank,id:287}],[],
 Date.parse("2026-11-11T02:00:00Z")).status,"review");
assert.equal(previewBillAppMatch({...candidate,transfer_at_vn:null},[bank],[],
 Date.parse("2026-11-11T02:00:00Z")).status,"review");

for(const text of ["image_layout","KHÔNG ghi công nợ","bố cục","ngày hạch toán",
 "thanh trạng thái","multiple_transactions"]){
 assert.ok(SYSTEM_PROMPT.toLowerCase().includes(text.toLowerCase()),text);
}
const edge=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",
 import.meta.url),"utf8");
for(const marker of ["classifyBillRecognition(parsed,fields,verdict)",
 "recognition_case:recognition.recognition_case",
 "missing_fields:recognition.missing_fields",
 "requiredAutoCollectEvidence(fields)",
 'db.rpc("chat_bank_app_collect"']){
 assert.ok(edge.includes(marker),"edge must retain "+marker);
}
console.log("BANK-286: layout and failure-mode casebook, strict bank matching, manual fallback PASS");
