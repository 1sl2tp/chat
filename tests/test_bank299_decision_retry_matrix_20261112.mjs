import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {describeBillDecision,isRetryableBillScanReason,BILL_DECISION_RULE_VERSION}
 from "../supabase/functions/v21-bank-bill-event/bill-decision-policy.mjs";

assert.equal(BILL_DECISION_RULE_VERSION,"bank_bill_decision_v1_20261112");
for(const reason of [
 "gemini_http_408","gemini_http_429","gemini_http_503","gemini_http_599",
 "AbortError","The signal has been aborted","failed to fetch","Load failed",
 "gemini_invalid_json","storage_download_failed","hash_registry_unavailable",
 "worker_interrupted"
]){
 assert.equal(isRetryableBillScanReason(reason),true,reason);
 assert.equal(isRetryableBillScanReason("amount_scan_"+reason),true,"prefixed "+reason);
 assert.equal(describeBillDecision({status:"failed",reason:"amount_scan_"+reason}).kind,
  "technical_failure",reason);
 assert.equal(describeBillDecision({status:"failed",reason:"amount_scan_"+reason}).next_action,
  "retry_bounded",reason);
}
for(const reason of [
 "gemini_http_400","gemini_http_401","gemini_http_403",
 "gemini_key_missing","unsupported_image_size","amount_text_unreadable",
 "bill_printed_time_missing","gemini_http_200","gemini_http_404",
 "gemini_http_600","gemini_invalid_json_extra","hash_registry_lookup_failed","",
 "garbage gemini_http_503"
])assert.equal(isRetryableBillScanReason(reason),false,reason);
const check=(status,preview,expectedKind,action)=> {
 const d=describeBillDecision({status,amount_vnd:3000000,ledger_id:null,match_preview:preview});
 assert.equal(d.kind,expectedKind,JSON.stringify({status,preview}));
 assert.equal(d.next_action,action,JSON.stringify({status,preview}));
 assert.equal(d.financial_authorized,false);
 return d;
};
check("amount_read",{status:"waiting_bank_event",reason:"no_matching_agribank_notification"},
 "waiting_bank","await_bank_event");
check("amount_read",{status:"review",reason:"ocr_date_corrected_bank_memo_unverified"},
 "evidence_conflict","manual_verify");
check("amount_read",{status:"review",reason:"competing_bills_one_bank_credit_unverified"},
 "evidence_conflict","manual_verify");
check("amount_read",{status:"review",reason:"reference_or_memo_unreadable"},
 "missing_evidence","manual_verify");
check("amount_read",{status:"review",reason:"bill_time_unreadable"},
 "missing_evidence","manual_verify");
check("amount_read",{status:"review",reason:"matching_data_incomplete"},
 "technical_block","retry_bank_lookup");
check("amount_read",{status:"review",reason:"matching_preview_unavailable"},
 "technical_block","retry_bank_lookup");
check("amount_read",{status:"candidate_unique",notification_id:270},
 "pending_financial_rpc","recheck_ledger_and_rpc");
check("amount_read",null,"unverified","manual_verify");
check("review",null,"requires_review","manual_verify");
check("non_bill",null,"not_bill","none");
check("duplicate",null,"duplicate","none");
check("queued",null,"processing","await_worker");
check("scanning",null,"processing","await_worker");
assert.equal(describeBillDecision({status:"review",reason:"amount_scan_gemini_key_missing"}).kind,
 "technical_failure");
assert.equal(describeBillDecision({status:"received",ledger_id:850,
 raw_read:{match_preview:{status:"review",reason:"old_preview"}}}).kind,
 "collected","Ledger is canonical: old preview cannot override an already received receipt");
assert.equal(describeBillDecision({status:"received",ledger_id:null}).kind,"integrity_alert");
assert.equal(describeBillDecision({status:"amount_read",ledger_id:850}).kind,"integrity_alert");
assert.equal(describeBillDecision({status:"failed",reason:"amount_scan_gemini_http_401"}).next_action,
 "admin_check");
assert.equal(describeBillDecision({status:"mystery"}).kind,"unclassified");

// Retry entry and failure classifier MUST share one function, and this
// helper must never be allowed to post money or mutate receipt rows.
const src=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert.ok(src.includes('const transientError=isRetryableBillScanReason(job.reason);'));
assert.ok(src.includes('const retryable=isRetryableBillScanReason(reason);'));
assert.ok(src.includes('db.rpc("chat_bank_app_collect"'));
assert.ok(src.includes('decision:describeBillDecision({status,reason,match_preview:storedPreview})'));
const helper=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/bill-decision-policy.mjs",import.meta.url),"utf8");
assert.doesNotMatch(helper,/\b(?:db\.from|db\.rpc|insert into|update public|delete from|fetch\()\b/i);

// Frontend's technical error text should never say that a 503 or invalid
// JSON means the customer image is not a bank receipt.
const dashboard=readFileSync(new URL("../bank-report-dashboard.js",import.meta.url),"utf8");
const a=dashboard.indexOf("function scanIssueLabel(");
const b=dashboard.indexOf("\nlet active=",a);
assert.ok(a>0&&b>a,"dashboard reason helper exists");
const label=runInNewContext(dashboard.slice(a,b)+"\nscanIssueLabel;");
assert.match(label("amount_scan_gemini_invalid_json"),/dữ liệu|JSON|AI/i);
assert.match(label("amount_scan_storage_download_failed"),/ảnh|tải/i);
assert.match(label("amount_scan_gemini_http_503"),/lỗi|thử lại/i);
assert.match(label("amount_scan_gemini_key_missing"),/khóa|API/i);
assert.doesNotMatch(label("amount_scan_gemini_invalid_json"),/không phân loại được ảnh/i);

console.log("BANK-299: single retry predicate, precedence, 4 real pending categories, UI error types PASS");
