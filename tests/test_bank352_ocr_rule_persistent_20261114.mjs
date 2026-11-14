import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RULE_VERSION,SYSTEM_PROMPT,TEN_FIELD_BILL_GUIDANCE,
 BILL_LITERAL_MEMO_OCR_GUIDANCE} from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
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
assert(worker.includes('const prompt=SYSTEM_PROMPT+"\\n\\n"+TEN_FIELD_BILL_GUIDANCE'),
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
