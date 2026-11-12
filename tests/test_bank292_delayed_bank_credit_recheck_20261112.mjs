import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {officialCreditWindow} from
 "../supabase/functions/v21-agribank-notification-ingest/credit-recheck.mjs";
import {eligibleForPrintedDateRescan} from
 "../supabase/functions/v21-bank-bill-event/bill-review-recheck.mjs";
import {previewBillAppMatch} from
 "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// Official Agribank arrived at 09:19:38; bill was OCR scanned at 09:17:53.
const body="Agribank: 09:17 12/11/2026 Tài khoản 2901181999999: +2,000,000VND. "+
 "Nội dung giao dịch: DINH THI TUYET chuyen tien. Số dư cuối: -139,114,730VND";
assert.deepEqual(officialCreditWindow(body),{
 from:"2026-11-12T02:12:00.000Z",to:"2026-11-12T02:47:00.000Z",
 businessDate:"2026-11-12"
});
for(const bankText of [
 body.replace("2901181999999","2901181998888"),
 body.replace("12/11/2026","31/02/2026"),
 body.replace("Agribank: 09:17","Techcombank: 09:17"),
 body.replace("09:17 12/11/2026","09:17 12/11"),
 body.replace("09:17","25:17")
]) assert.equal(officialCreditWindow(bankText),null,"Reject invalid official-bank clock/account");

const now=Date.parse("2026-11-12T02:20:05Z");
const job={status:"review",reason:"bill_printed_datetime_conflict",
 sent_at:"2026-11-12T02:17:44.699Z",scanned_at:"2026-11-12T02:17:53.120Z",
 attempt_count:1};
const receipt={amount_vnd:2000000,ledger_id:null,receiving_account:"2901181999999",
 receiving_bank:"AGRIBANK",transfer_at_vn:"2026-11-12 09:17:00",
 raw_read:{rule_version:"bank_bill_amount_v5_20261110",
   printed_date_invalid:true,transfer_date_printed_vn:null,
   transfer_date_vn:"2026-11-12",transfer_time_printed_vn:"9:17",
   time_date_conflict:false,clock_text_conflict:false,
   ocr_iso_date_conflict:false,
   image_type:"successful_transfer_receipt",
   transaction_nature:"transfer",transaction_selection:"single_detail",
   transfer_success_visible:true,amount_clear:true,
   transfer_content:"DINH THI TUYET chuyen tien"}};
assert.equal(eligibleForPrintedDateRescan(job,receipt,now),true,
 "one image rescan, never a financial posting, is allowed");
const reject=[
 [job,{...receipt,ledger_id:848}],
 [job,{...receipt,receiving_account:"290118199999"}],
 [job,{...receipt,receiving_bank:"TECHCOMBANK"}],
 [job,{...receipt,amount_vnd:0}],
 [job,{...receipt,transfer_at_vn:"2026-11-12 09:18:00"}],
 [job,{...receipt,transfer_at_vn:"2026-11-11 09:17:00"}],
 [job,{...receipt,raw_read:{...receipt.raw_read,printed_date_invalid:false}}],
 [job,{...receipt,raw_read:{...receipt.raw_read,transfer_time_printed_vn:null}}],
 [job,{...receipt,raw_read:{...receipt.raw_read,transfer_content:"abc"}}],
 [job,{...receipt,raw_read:{...receipt.raw_read,time_date_conflict:true}}],
 [job,{...receipt,raw_read:{...receipt.raw_read,clock_text_conflict:true}}],
 [job,{...receipt,raw_read:{...receipt.raw_read,ocr_iso_date_conflict:true}}],
 [job,{...receipt,raw_read:{...receipt.raw_read,transaction_selection:"unclear"}}],
 [{...job,attempt_count:2},receipt],
 [{...job,status:"amount_read"},receipt],
 [{...job,sent_at:"2026-11-11T02:17:44Z"},receipt],
 [{...job,scanned_at:"2026-11-12T02:20:00Z"},receipt]
];
for(const [j,r] of reject)
 assert.equal(eligibleForPrintedDateRescan(j,r,now),false,
 "Incorrect evidence cannot be reprocessed as proof");

// The bank pairing for a one-time OCR retry requires the official complete
// destination account and exact memo, not an upload time or image alone.
const candidate={media_asset_id:"test-one-time-recheck",status:"amount_read",
 amount_vnd:2000000,sent_at:job.sent_at,transfer_at_vn:receipt.transfer_at_vn,
 receiving_account:receipt.receiving_account,receiving_bank:"AGRIBANK",
 transaction_nature:"transfer",transfer_content:receipt.raw_read.transfer_content,
 requires_bank_memo:true,ocr_date_normalization_corrected:true};
const credit={id:269,status:"credit_candidate",is_own_transfer:false,
 amount_vnd:2000000,package_name:"com.vnpay.Agribank3g",body};
assert.equal(previewBillAppMatch(candidate,[credit],[],now).status,"candidate_unique");
assert.equal(previewBillAppMatch({...candidate,transfer_content:"OTHER PAYER chuyen tien"},[credit],[],now).status,"review");
assert.equal(previewBillAppMatch(candidate,[credit,{...credit,id:270}],[],now).status,"review");
assert.equal(previewBillAppMatch(candidate,[{...credit,
 body:body.replace("09:17","09:21")}],[],now).status,"waiting_bank_event");

const index=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
const ingest=readFileSync(new URL("../supabase/functions/v21-agribank-notification-ingest/index.ts",import.meta.url),"utf8");
assert.match(index,/eligibleForPrintedDateRescan\(job,r\)/);
assert.match(index,/requires_bank_memo:true,ocr_date_normalization_corrected:true/);
assert.match(index,/retryPrintedDate\?"review":retryFailed\?"failed":"queued"/);
assert.match(index,/if\(job.status!=="queued"&&!retryFailed&&!retryPrintedDate\)/);
assert.match(index,/db\.rpc\("chat_bank_app_collect"/);
assert.match(ingest,/EdgeRuntime\.waitUntil\(/);
assert.match(ingest,/recheckNewCredit\(body,amount\)/);
assert.match(ingest,/recheck_bank_credit:true/);
assert.match(ingest,/saved\.length===1/);
assert.match(ingest,/rows\.length>4/);
assert.doesNotMatch(ingest,/chat_bank_app_collect|taphoa_debt_ledger/);
console.log("BANK-292 event-driven delayed bank credit, bounded single OCR rescan, fail-closed finance PASS");
