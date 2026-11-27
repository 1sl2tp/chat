import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildBillVisionPrompt,REGION_GUIDE} from "../supabase/functions/v21-bank-bill-event/bill-vision-reader.mjs";
import {RULE_VERSION,SYSTEM_PROMPT,TEN_FIELD_BILL_GUIDANCE,
 BILL_LITERAL_MEMO_OCR_GUIDANCE,readV4Fields,buildStoredBillTenFields,ACCOUNT_DIGIT_RECHECK_PROMPT,needsAccountDigitRecheck,resolveAccountDigitRecheck,parseSenderDebitNotice,validateVisionRead,SENDER_DEBIT_NOTICE_GUIDANCE} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// BANK-352: pure, anonymized regression. No bank API, customer messaging,
// real Gemini request, direct ledger writes or production image re-scan.
assert.equal(RULE_VERSION,"bank_bill_amount_v5_20261110",
 "keep backward-compatible stored receipt rule until reviewed migration");
assert(SYSTEM_PROMPT.includes("Chỉ trích xuất dữ liệu nhìn thấy"));
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("u/o, v/y, i/l"));
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("CHUYEN TIEN"));
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("CHOYEN TIEN"));
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("KHÔNG được tự chèn"));
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("uncertainty"));
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("mã tham chiếu"));
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("Agribank độc lập"));
assert(TEN_FIELD_BILL_GUIDANCE.includes(BILL_LITERAL_MEMO_OCR_GUIDANCE),
 "stored OCR prompt actually includes the learning rule");
const worker=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert(worker.includes('const model="gemini-3.5-flash-lite"'),"same Gemini reader");
assert(worker.includes('Deno.env.get("GEMINI_API_KEY")'),"reuse existing server secret");
assert(worker.includes("const prompt=buildBillVisionPrompt(SYSTEM_PROMPT,TEN_FIELD_BILL_GUIDANCE,executionDateGuide);")&&
 buildBillVisionPrompt(SYSTEM_PROMPT,TEN_FIELD_BILL_GUIDANCE).includes(BILL_LITERAL_MEMO_OCR_GUIDANCE)&&
 buildBillVisionPrompt(SYSTEM_PROMPT,TEN_FIELD_BILL_GUIDANCE).includes(REGION_GUIDE),
 "Gemini request uses the updated persistent rule");
assert(worker.includes('temperature:0,responseMimeType:"application/json"'));
assert(worker.includes('db.rpc("chat_bank_app_collect"'),"money only through existing guarded RPC");
const fall=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/bill-gemini-failover.mjs",import.meta.url),"utf8");
assert(fall.includes('BILL_OCR_FALLBACK_MODEL="gemini-3.5-flash"'));
assert(fall.includes("BILL_OCR_MAX_MODEL_REQUESTS=3"));
const memo="CUSTOMER TEST EXAMPLE chuyen tien";
const bank={id:13,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 is_own_transfer:false,amount_vnd:1000000,body:
 "Agribank: 08:19 14/11/2026 Tài khoản 2901181999999: +1,000,000VND. Nội dung giao dịch: "+
 "MBVCB.17030210865.218318."+memo+
 ".CT tu 1028483735 CUSTOMER TEST EXAMPLE toi 2901181999999 Bui Xuan Tung tai AGRIBANK. Số dư cuối: 2,000,000VND"};
const bill={
 media_asset_id:"synthetic",status:"amount_read",amount_vnd:1000000,
 sent_at:"2026-11-14T01:20:00Z",transfer_at_vn:"2026-11-14 08:19:00",
 receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",receiving_account:"290118199999",
 receiving_account_last5:"99999",transfer_content:"CUSTOMER TEST EXAMPLE choyen tien",
 transfer_reference:"17030210865",transaction_nature:"transfer",
 requires_bank_memo:true,ocr_date_normalization_corrected:false
};
const check=(v=bill,events=[bank],others=[])=>previewBillAppMatch(v,events,others,Date.parse("2026-11-14T01:29:00Z"));
assert.equal(check().status,"candidate_unique","only with full independent bank envelope");
assert.equal(check({...bill,transfer_reference:"17030210866"}).status,"review");
assert.equal(check({...bill,transfer_content:"CUSTOMER TEST EXAMPLE choyen tiin"}).status,"review");
assert.equal(check({...bill,receiving_account_last5:"99998"}).status,"review");
assert.equal(check(bill,[bank,{...bank,id:14}]).status,"review");
const casebook=readFileSync(new URL("../docs/bank-bill-ocr-casebook.md",import.meta.url),"utf8");
assert(casebook.includes("BANK-352 — Bài học OCR"));
assert(casebook.toLowerCase().includes("không phải huấn luyện lại"));
console.log("BANK-352: existing Gemini token/model, persistent OCR instruction, bank-only confirmation and duplicate guards PASS");

// Multiline recipient memo and repeated-digit regression; only synthetic text.
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("TẤT CẢ các dòng"));
assert(BILL_LITERAL_MEMO_OCR_GUIDANCE.includes("từ phải qua trái"));
const multi={recipient_account_visible:"123456799999",recipient_account_last5:"99999",transfer_content:"KHACH MAU\nChuyen tien"};
const fields=readV4Fields(multi);
assert.equal(fields.receiving_account,multi.recipient_account_visible);
assert.equal(fields.transfer_content,multi.transfer_content);
assert.equal(buildStoredBillTenFields(multi,fields,5000000).transfer_content,multi.transfer_content);
assert.equal(buildStoredBillTenFields(multi,fields,5000000).recipient_account,multi.recipient_account_visible);

const first={image_type:"successful_transfer_receipt",transfer_success_visible:true,recipient_account_visible:"290118199999"};
const second={role:"recipient_account",clear:true,visible:"2901181999999",digits:[..."2901181999999"],reverse_digits:[..."2901181999999"].reverse(),digit_count:13,trailing_nines:6};
assert.equal(needsAccountDigitRecheck(first),true);
assert.equal(resolveAccountDigitRecheck(first,second)?.second_visible,"2901181999999");
assert.equal(first.recipient_account_visible,"290118199999");
for(const bad of [{...second,clear:false},{...second,reverse_digits:[]},{...second,reverse_digits:[..."2901181999999"]},{...second,role:"sender_account"},{...second,digits:[..."290118199999"]},{...second,digit_count:12},{...second,trailing_nines:5},{...second,visible:"2901181999998"}])assert.equal(resolveAccountDigitRecheck(first,bad),null);
assert.equal(needsAccountDigitRecheck({...first,recipient_account_visible:"2901181999999"}),false);
assert.equal(needsAccountDigitRecheck({...first,image_type:"not_transfer_receipt"}),false);
assert.equal(ACCOUNT_DIGIT_RECHECK_PROMPT.includes("2901181999999"),false);
assert(worker.includes("focusedReadBudget({started:ocrStarted,now:Date.now(),requests:modelRequests,signal:ctl.signal}).allowed"));
assert.equal((worker.match(/maxRequests:1/g)||[]).length,2);
assert(fall.includes("requests<BILL_OCR_MAX_MODEL_REQUESTS"));
assert(worker.includes("account_digit_recheck:accountDigitRecheck"));

assert(worker.includes("maxOutputTokens:2048"));
assert(worker.includes("account_digit_recheck_state:accountDigitRecheckState"));

const debitNotice={"image_type":"successful_transfer_receipt","image_layout":"credit_notification","transaction_nature":"transfer","transaction_selection":"single_detail","transfer_success_visible":true,"amount_role":"sender_debit","amount_text":"-1,234,000VND","amount_vnd":1234000,"amount_clear":true,"recipient_name":"NGUYEN VAN MAU","recipient_account_visible":"1234567890123","transfer_date_printed_vn":"24/11/26","transfer_time_printed_vn":"15:16","transfer_date_vn":"2026-11-24","transfer_content":"KHACH MAU chuyen tien","sender_debit_gd_text":"GD: -1,234,000VND 24/11/26 15:16"};

assert.equal(validateVisionRead(debitNotice).amount_vnd,1234000);
assert.equal(parseSenderDebitNotice(debitNotice)?.day,"2026-11-24");
assert.equal(readV4Fields(debitNotice).transfer_at_vn,"2026-11-24 15:16");
assert.equal(readV4Fields(debitNotice).transfer_date_printed_vn,"24/11/26");
for(const bad of [{...debitNotice,image_type:"bank_credit_notification"},{...debitNotice,amount_vnd:9876543},{...debitNotice,transfer_date_printed_vn:"25/11/26"},{...debitNotice,sender_debit_gd_text:""},{...debitNotice,sender_debit_gd_text:debitNotice.sender_debit_gd_text+" |SD: 9876543VND"},{...debitNotice,sender_debit_gd_text:debitNotice.sender_debit_gd_text.replace("GD: -","GD: +")}])assert.equal(parseSenderDebitNotice(bad),null);
assert(TEN_FIELD_BILL_GUIDANCE.includes(SENDER_DEBIT_NOTICE_GUIDANCE));
assert.equal(Object.hasOwn(buildStoredBillTenFields(debitNotice,readV4Fields(debitNotice),1234000),"sender_debit_gd_text"),false);
