// BANK-299: Deterministic reporting and technical retry policy.
// Important: this module has NO authority to collect, modify status, select a
// bank credit or bypass public.chat_bank_app_collect. It is interpretation only.
export const BILL_DECISION_RULE_VERSION="bank_bill_decision_v1_20261112";

// The same predicate is used at scan-failure classification and at
// cron-triggered failed-job reentry. Keep both paths in sync.
const TECHNICAL_RETRY= /^(?:gemini_http_(?:408|429|5\d\d)|The signal has been aborted|AbortError|failed to fetch|Load failed|gemini_invalid_json|storage_download_failed|hash_registry_unavailable|hash_registry_lookup_failed|worker_interrupted)$/i;

export function isRetryableBillScanReason(reason){
 const text=String(reason||"").trim().replace(/^amount_scan_/i,"");
 return TECHNICAL_RETRY.test(text);
}
const PREVIEW_TECHNICAL=new Set(["matching_data_incomplete","matching_preview_unavailable"]);
const PREVIEW_MISSING=new Set([
  "bill_time_unreadable","reference_or_memo_unreadable",
  "no_matching_shared_reference","bill_unreadable","reference_path_not_applicable",
  "bill_date_missing_or_not_current"
]);

// Distinguish legal ledger status from the *reason for incomplete matching*.
// Derived state must be recomputed on read, NEVER stored as if it were canonical:
// after the service-role RPC posts a ledger, prior previews can be stale.
export function describeBillDecision(row={}){
 const status=String(row?.status||"");
 const reason=String(row?.reason||"");
 const preview=row?.match_preview||row?.raw_read?.match_preview||null;
 const previewStatus=String(preview?.status||"");
 const previewReason=String(preview?.reason||"");
 const ledger=row?.ledger_id;
 const hasLedger=ledger!==null&&ledger!==undefined&&String(ledger)!=="";
 const result=(kind,next_action,detail)=>({
  policy_version:BILL_DECISION_RULE_VERSION,
  kind,next_action,detail,
  // A preview and this classifier can never authorize financial posting.
  financial_authorized:false
 });
 if(status==="received")return hasLedger
  ?result("collected","none","ledger_verified")
  :result("integrity_alert","investigate","received_without_ledger");
 if(hasLedger)return result("integrity_alert","investigate","ledger_without_received");
 if(status==="duplicate")return result("duplicate","none",reason||"duplicate_or_reupload");
 if(status==="non_bill")return result("not_bill","none",reason||"not_transfer_receipt");
 if(status==="queued"||status==="scanning")return result("processing","await_worker",status);
 if(status==="failed")return isRetryableBillScanReason(reason)
  ?result("technical_failure","retry_bounded",reason)
  :result("technical_failure","admin_check",reason||"failed_unclassified");
 if(status==="review"){
  if(/^amount_scan_/i.test(reason))return result("technical_failure","admin_check",reason);
  return result("requires_review","manual_verify",reason||"review_without_reason");
 }
 if(status==="amount_read"){
  if(previewStatus==="candidate_unique")
   return result("pending_financial_rpc","recheck_ledger_and_rpc","candidate_is_not_received");
  if(previewStatus==="waiting_bank_event")
   return result("waiting_bank","await_bank_event",previewReason||"bank_credit_not_yet_confirmed");
  if(previewStatus==="review"&&PREVIEW_TECHNICAL.has(previewReason))
   return result("technical_block","retry_bank_lookup",previewReason);
  if(previewStatus==="review"&&PREVIEW_MISSING.has(previewReason))
   return result("missing_evidence","manual_verify",previewReason);
  if(previewStatus==="review")
   return result("evidence_conflict","manual_verify",previewReason||"bank_match_review");
  return result("unverified","manual_verify","missing_bank_preview");
 }
 return result("unclassified","admin_check",status||"unknown_status");
}
