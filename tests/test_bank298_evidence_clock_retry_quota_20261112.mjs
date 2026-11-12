import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {previewBillAppMatch} from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";
import {vietnamBusinessDayStartUtc} from "../supabase/functions/v21-bank-bill-event/bill-vietnam-day.mjs";

// BANK-298: 00:00 VN == previous UTC day 17:00, including exact boundaries.
const cutoffs=[
 ["2026-11-12T16:59:59.999Z","2026-11-11T17:00:00.000Z"],
 ["2026-11-12T17:00:00.000Z","2026-11-12T17:00:00.000Z"],
 ["2026-11-12T00:00:00.000Z","2026-11-11T17:00:00.000Z"],
 ["2026-11-12T08:33:44.000Z","2026-11-11T17:00:00.000Z"],
 ["2026-12-31T17:00:00.000Z","2026-12-31T17:00:00.000Z"],
 ["2027-01-01T16:59:59.999Z","2026-12-31T17:00:00.000Z"],
];
for(const [at,expected] of cutoffs){
 assert.equal(vietnamBusinessDayStartUtc(new Date(at)),expected,at);
}
assert.throws(()=>vietnamBusinessDayStartUtc(Number.NaN),/scan_budget_clock_invalid/);
const bill={
 media_asset_id:"bank298-synthetic",status:"amount_read",amount_vnd:2000000,
 sent_at:"2026-11-12T08:33:50.000Z",transfer_at_vn:"2026-11-12 15:33:28",
 receiving_name:"BUI XUAN TUNG",receiving_bank:"AGRIBANK",
 receiving_account:"2901181999999",receiving_account_last5:"99999",
 transaction_nature:"transfer",requires_bank_memo:false
};
const notice={
 id:298,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 is_own_transfer:false,amount_vnd:2000000,posted_at:"2026-11-12T08:41:00Z",
 body:"Agribank: 15:33 12/11/2026 Tài khoản 2901181999999: +2,000,000VND. Nội dung giao dịch: NGUYEN VAN A chuyen tien den BUI XUAN TUNG. Số dư cuối: 1VND"
};
const check=(n,b=bill,now="2026-11-12T09:00:00Z")=>previewBillAppMatch(b,[n],[],Date.parse(now));
assert.equal(check(notice).status,"candidate_unique","valid third-party incoming transfer");
assert.equal(check({...notice,body:notice.body.replace("BUI XUAN TUNG","Bùi Xuân Tùng")}).status,"candidate_unique",
 "recipient mentioned AFTER sender is not an internal transfer");

for(const memo of [
 "BUI XUAN TUNG chuyen tien",
 "Bùi Xuân Tùng chuyen tien",
 "bùi xuân tùng chuyen tien",
 "BÙI   XUÂN   TÙNG chuyen tien",
 "QR - Bùi Xuân Tùng chuyen tien",
 "MB(046501)(Bùi Xuân Tùng chuyen tien)",
 "MB(046501)(BÙI XUÂN TÙNG chuyen tien)",
]){
 const n={...notice,body:notice.body.replace(
  "NGUYEN VAN A chuyen tien den BUI XUAN TUNG",memo)};
 const result=check(n);
 assert.equal(result.status,"waiting_bank_event",memo);
 assert.equal(result.reason,"no_matching_agribank_notification",memo);
}
assert.equal(check({...notice,is_own_transfer:true}).status,"waiting_bank_event");
assert.equal(check({...notice,body:notice.body.replace("NGUYEN VAN A chuyen tien den BUI XUAN TUNG",
 "NGUYEN VAN A chuyen tien den BÙI XUÂN TÙNG")}).status,"candidate_unique");
for(const d of ["31/02/2026","00/03/2026","29/02/2026","12/13/2026",
 "32/11/2026","00/00/2026"]){
 const n={...notice,body:notice.body.replace("12/11/2026",d)};
 assert.equal(check(n).status,"waiting_bank_event",d);
}
// Leap year is a valid bank calendar day; it is not guessed from upload date.
const leapBill={...bill,transfer_at_vn:"2024-02-29 15:33:28",
 sent_at:"2024-02-29T08:33:50Z"};
const leapNotice={...notice,body:notice.body.replace("12/11/2026","29/02/2024")};
assert.equal(check(leapNotice,leapBill,"2024-02-29T09:00:00Z").status,"candidate_unique");
const outsideMinute=check({...notice,body:notice.body.replace("15:33","15:36")});
assert.equal(outsideMinute.status,"review");
assert.equal(outsideMinute.reason,"bank_time_outside_one_minute",
 "Known bank credit at 3-minute distance must be review, not waiting for unknown credit");
assert.equal(check({...notice,amount_vnd:1000000}).status,"waiting_bank_event");
// These tests are read-only: any positive preview still cannot post a ledger.
assert.equal(check(notice).ledger_written,false);
const worker=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert.ok(worker.includes('import {vietnamBusinessDayStartUtc} from "./bill-vietnam-day.mjs"'));
assert.ok(worker.includes("todayUTC=vietnamBusinessDayStartUtc(now)"));
assert.ok(worker.includes('error:"scan_budget_unavailable"'));
assert.ok(worker.includes("customerBudgetError||globalBudgetError"));
const begin=worker.indexOf("const ctl=new AbortController()");
const read=worker.indexOf("await vision.response.json()",begin);
const cleanup=worker.indexOf("}finally{clearTimeout(timeout);}",begin);
assert.ok(begin>=0&&read>begin&&cleanup>read,
 "Gemini response body MUST be read before 30-second timeout is cleared");
assert.ok(worker.includes('if(ctl.signal.aborted)throw new Error("AbortError")'));
assert.ok(worker.includes('if(!Array.isArray(parts))throw new Error("gemini_invalid_json")'));
const retryPolicy=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/bill-decision-policy.mjs",import.meta.url),"utf8");
assert.ok(retryPolicy.includes("gemini_invalid_json|storage_download_failed"),
 "Malformed Gemini transport JSON stays a retryable technical issue in the shared policy");
assert.ok(worker.includes("isRetryableBillScanReason(reason)"),
 "Worker must consume the exact same technical reason predicate as cron-driven retries");
assert.ok(worker.includes('db.rpc("chat_bank_app_collect"'),
 "Only protected financial RPC can post a collection");
console.log("BANK-298: VN midnight, accented own-transfer, calendar, Gemini HTTP body deadline PASS");
