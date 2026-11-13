import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {buildStoredBillTenFields,TEN_FIELD_BILL_GUIDANCE,readV4Fields}
 from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";

const parsed={
 image_type:"successful_transfer_receipt",
 sending_bank:"VPBank",receiving_bank:null,
 recipient_name:"BUI XUAN TUNG",recipient_account_visible:"2901181999999",
 amount_vnd:730000,amount_text:"730 000đ",amount_clear:true,
 transfer_date_printed_vn:"12/11/2026",transfer_date_vn:"2026-11-12",
 transfer_time_printed_vn:null,transaction_datetime_vn:null,
 transfer_content:"LAI VAN TAN chuyen tien",
 transfer_reference:"NAPAS_INPLIBFTI2ZK14AV",
 trace_code:"628193",transfer_method:"Chuyển tiền nhanh"
};
const fields=readV4Fields(parsed,{sentAt:"2026-11-12T12:31:00.000Z"});
const ten=buildStoredBillTenFields(parsed,fields,730000);
assert.deepEqual(Object.keys(ten),[
 "sending_bank","receiving_bank","recipient_name","recipient_account",
 "amount_vnd","transfer_date_printed_vn","transfer_time_printed_vn",
 "transfer_content","transfer_reference","trace_code"
]);
assert.equal(ten.sending_bank,"VPBank");
assert.equal(ten.receiving_bank,null,
 "Do not infer beneficiary bank from sender app or an account-number prefix");
assert.equal(ten.recipient_name,"BUI XUAN TUNG");
assert.equal(ten.recipient_account,"2901181999999");
assert.equal(ten.amount_vnd,730000);
assert.equal(ten.transfer_date_printed_vn,"12/11/2026");
assert.equal(ten.transfer_time_printed_vn,null,
 "Phone status-bar 19:31 cannot be borrowed as transaction hour");
assert.equal(ten.transfer_content,"LAI VAN TAN chuyen tien");
assert.equal(ten.transfer_reference,"NAPAS_INPLIBFTI2ZK14AV");
assert.equal(ten.trace_code,"628193",
 "Trace code is a distinct printed field, not a copy of NAPAS reference");

const noData=buildStoredBillTenFields(
 {recipient_name:null,trace_code:null,transfer_method:null},
 {receiving_bank:null,receiving_name:null,receiving_account_visible:null,
  sending_bank:null,transfer_content:null,transfer_reference:null,
  transfer_date_printed_vn:null,transfer_time_printed_vn:null},null);
assert.deepEqual(Object.values(noData),Array(10).fill(null),
 "Do not guess the expected beneficiary name or account when no image evidence exists");
assert.equal(buildStoredBillTenFields(
 {...parsed,trace_code:null},fields,730000).trace_code,null,
 "Never substitute transfer_reference for an absent trace code");
assert.equal(buildStoredBillTenFields(
 {...parsed,trace_code:"628 193"},fields,730000).trace_code,null,
 "Ambiguous characters in an image must not be fabricated/normalized into a code");
const masked=readV4Fields({...parsed,recipient_name:null,recipient_account_visible:"*****99999"},{});
assert.equal(buildStoredBillTenFields(
 {...parsed,recipient_name:null,recipient_account_visible:"*****99999"},masked,730000).recipient_account,
 "*****99999","Preserve masking; no complete-account inference");

for(const part of ["10 NHÃN","Mã tra soát","Mã tham chiếu","null",
 "không mượn đồng hồ","không tự điền","lưu khi ảnh mới tới"]){
 assert(TEN_FIELD_BILL_GUIDANCE.toLowerCase().includes(part.toLowerCase()),
  "The OCR instruction needs "+part);
}
const edge=fs.readFileSync("supabase/functions/v21-bank-bill-event/index.ts","utf8");
assert(edge.includes('const prompt=SYSTEM_PROMPT+"\\n\\n"+TEN_FIELD_BILL_GUIDANCE+'),
 "Keep canonical ten-field OCR prompt and append bank-backed execution-date guidance only during retries");
assert(edge.includes('const executionDateGuide=retryPrintedDate?['));
assert(edge.includes("const tenFields=buildStoredBillTenFields(parsed,fields,amount);"));
assert(edge.includes("bill_fields_v1:tenFields"));
assert(edge.includes("trace_code:tenFields.trace_code"));
assert(edge.includes("await requestParsedBillGemini({"),
 "Only the initial image-ingestion worker may call AI");
const ui=fs.readFileSync("bank-report-dashboard.js","utf8");
const start=ui.indexOf("async function openManualBillDialog(");
const stop=ui.indexOf("async function openCollectionDialog(",start);
assert(start>=0&&stop>start);
const dialog=ui.slice(start,stop);
assert(!/Gemini|AI\.generate|requestParsedBill|image-ocr/i.test(dialog),
 "Opening the Admin report must use stored OCR, never run another image model");
assert(dialog.includes("const rows=bankSimpleTenFieldRows("));
assert(dialog.includes("document.body.appendChild(ui.review)"),
 "Modal must float over Contacts instead of being clipped inside Chat stage");
const helpersStart=ui.indexOf("function bankSimpleTenFieldRows(");
const helpersEnd=ui.indexOf("function bankManualBillPrepareErrorMessage(",helpersStart);
const helperSrc=ui.slice(helpersStart,helpersEnd);
const {bankSimpleTenFieldRows}=vm.runInNewContext(helperSrc+
 "\n({bankSimpleTenFieldRows})",{
 bankManualBillEvidenceRows:()=>[
  {label:"Ngân hàng gửi",bill:"API chưa trả",bank:"",tone:"pending",result:"API chưa trả"},
  {label:"Ngân hàng nhận",bill:"—",bank:"",tone:"pending",result:"Chưa rõ"},
  {label:"Tên chủ TK nhận",bill:"API chưa trả",bank:"",tone:"pending",result:"API chưa trả"},
  {label:"Số tài khoản nhận",bill:"2901181999999",bank:"2901181999999",tone:"matched",result:"Khớp"},
  {label:"Số tiền (÷1.000)",bill:"730",bank:"730",tone:"matched",result:"Cùng số tiền · chưa liên kết"},
  {label:"Ngày giao dịch",bill:"API chưa trả",bank:"12/11/2026",tone:"pending",result:"Ngày AI chưa trả"},
  {label:"Giờ giao dịch",bill:"Bill không in giờ giao dịch",bank:"19:31",tone:"review",result:"Thiếu giờ"},
  {label:"Nội dung chuyển khoản",bill:"API chưa trả",bank:"",tone:"pending",result:"API chưa trả"},
  {label:"Mã tham chiếu",bill:"NAPAS_INPLIBFTI2ZK14AV",bank:"",tone:"pending",result:"Không có mã"}
 ]
});
const old={receiving_name:"BUI XUAN TUNG",receiving_account:"2901181999999",
 amount_vnd:730000,transfer_reference:"NAPAS_INPLIBFTI2ZK14AV",
 bill_ocr:{sending_bank:"VPBank",recipient_name_printed:"BUI XUAN TUNG",
 transfer_date_printed_vn:"12/11/2026",transfer_time_printed_vn:null,
 transfer_content:"LAI VAN TAN chuyen tien"}};
const rows=bankSimpleTenFieldRows(old,{amount_vnd:730000});
assert.equal(rows.length,10);
assert.deepEqual(Array.from(rows,x=>x.label),[
 "Ngân hàng gửi","Ngân hàng nhận","Tên tài khoản nhận",
 "Số tài khoản nhận","Số tiền (÷1.000)","Ngày giao dịch",
 "Giờ giao dịch","Nội dung chuyển khoản","Mã giao dịch / tham chiếu","Mã tra soát"
]);
assert.equal(rows[0].bill,"VPBank");
assert.equal(rows[2].bill,"BUI XUAN TUNG");
assert.equal(rows[5].bill,"12/11/2026");
assert.equal(rows[6].tone,"review");
assert.equal(rows[7].bill,"LAI VAN TAN chuyen tien");
assert.equal(rows[9].bill,"Chưa có dữ liệu đã lưu");
assert.equal(bankSimpleTenFieldRows({
 ...old,bill_ocr:{...old.bill_ocr,bill_fields_v1:ten}
},null)[9].bill,"628193");
const css=fs.readFileSync("bank-report-dashboard.css","utf8");
assert(css.includes("body > [data-bank-review-modal]:not([hidden])"));
assert(css.includes("z-index:2147483000"));
console.log("BANK-317: one read, ten persisted fields, no guesses, old OCR reuse and portal over Contacts PASS");
