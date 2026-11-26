import {BILL_READER_VERSION,normalizeVisionMemo} from "./bill-vision-reader.mjs";
import {RULE_VERSION,readV4Fields,validateVisionRead,requiredAutoCollectEvidence,classifyBillRecognition,buildStoredBillTenFields,sanitizeJournalRecipientFields} from "./bill-amount-rules.mjs";

/**
 * Pure, fail-closed preparation for an authorized ORIGINAL-image reread.
 * Never call this with browser annotations or copied bank notification text.
 * Caller must authenticate, bind the reread to the immutable asset/hash,
 * lock and CAS the old row, persist an immutable correction event, and
 * enqueue normal reconciliation in the same transaction. No DB/ledger here.
 * An already collected, duplicate, historic, or inconclusive receipt is
 * not eligible for automatic evidence promotion.
 */
export function prepareVerifiedCorrection(row,read,nowMs=Date.now()){
 const blocked=reason=>({ok:false,reason});
 if(!row||!["review","amount_read"].includes(row.status)||row.ledger_id!==null||row.duplicate_of!==null)
  return blocked("receipt_not_open");
 if(!read||read.reader_version!==BILL_READER_VERSION||read.source!=="original_image_worker"||
    typeof row.image_sha256!=="string"||!/^[a-f0-9]{64}$/.test(row.image_sha256)||
    read.image_sha256!==row.image_sha256||read.receipt_id!==row.id||read.asset_id!==row.media_asset_id||
    typeof read.model!=="string"||!read.model.trim()||!read.parsed||!Number.isFinite(nowMs))
  return blocked("reread_identity_not_verified");
 const sent=Date.parse(String(row.sent_at||"")),completed=Date.parse(String(read.completed_at||""));
 const day=new Date(nowMs+7*3600000).toISOString().slice(0,10);
 if(!Number.isFinite(sent)||sent<Date.parse("2026-11-23T09:58:11.000Z")||
    sent>nowMs+120000||new Date(sent+7*3600000).toISOString().slice(0,10)!==day||
    !Number.isFinite(completed)||completed<sent||completed>nowMs+120000||nowMs-completed>300000)
  return blocked("not_current_verified_reread");
 const p=sanitizeJournalRecipientFields(normalizeVisionMemo(read.parsed));
 const fields=readV4Fields(p,{sentAt:row.sent_at});
 const verdict=validateVisionRead(p),evidence=requiredAutoCollectEvidence(fields);
 const recognition=classifyBillRecognition(p,fields,verdict);
 // More conservative than ordinary reads: exact recipient and printed date,
 // time, and strong literal memo are necessary for a financial correction.
 if(verdict.status!=="amount_read"||!evidence.complete||!Number.isSafeInteger(verdict.amount_vnd)||
    verdict.amount_vnd%1000!==0||fields.receiving_account!=="2901181999999"||
    fields.receiving_name!=="BUI XUAN TUNG"||fields.receiving_bank!=="AGRIBANK"||
    fields.transfer_date_vn!==day||!fields.transfer_date_printed_vn||!fields.transfer_time_printed_vn||
    !fields.transfer_at_vn||fields.transfer_at_vn.slice(0,10)!==day||
    fields.time_date_conflict||fields.clock_text_conflict||fields.printed_date_invalid||
    fields.ocr_iso_date_conflict||fields.date_swap_suspected||
    !["single_detail","latest_top_row"].includes(fields.transaction_selection)||
    recognition.missing_fields.length!==0||
    p.memo_line_state==="line_disagreement"||String(fields.transfer_content||"").replace(/[^\p{L}\p{N}]/gu,"").length<12)
  return blocked("new_evidence_incomplete_or_conflicting");
 const ten=buildStoredBillTenFields(p,fields,verdict.amount_vnd);
 // Construct a fresh projection, never inherit old derived flags, preview,
 // bank-time corrections or a previous successful match. Store prior raw
 // snapshot separately in an append-only event before applying this patch.
 const raw_read={
  read_mode:"amount_hash_only",rule_version:RULE_VERSION,reader_version:BILL_READER_VERSION,
  bill_fields_v1:ten,trace_code:ten.trace_code,
  memo_lines:p.memo_lines??null,memo_raw:p.memo_raw??null,memo_line_state:p.memo_line_state??null,
  image_type:p.image_type,amount_role:p.amount_role,amount_text:p.amount_text,
  amount_vnd:verdict.amount_vnd,amount_clear:true,transfer_success_visible:true,
  image_layout:recognition.image_layout,recognition_case:recognition.recognition_case,
  missing_fields:recognition.missing_fields,required_fields_complete:true,manual_review_reason:null,
  requires_bank_memo:true,bill_evidence_policy:"safe_memo_tier_v2",
  transaction_selection:fields.transaction_selection,transaction_nature:fields.transaction_nature,
  transaction_datetime_vn:fields.transfer_at_vn,transfer_date_vn:fields.transfer_date_vn,
  transfer_date_printed_vn:fields.transfer_date_printed_vn,
  transfer_date_printed_raw_vn:fields.transfer_date_printed_raw_vn,
  transfer_time_printed_vn:fields.transfer_time_printed_vn,
  transaction_time_precision:fields.transaction_time_precision,
  time_date_conflict:false,clock_text_conflict:false,printed_date_invalid:false,
  date_swap_suspected:false,ocr_iso_date_conflict:false,
  ocr_date_normalization_corrected:fields.ocr_date_normalization_corrected===true,
  recipient_account_visible:fields.receiving_account_visible,
  recipient_account_last5:fields.receiving_account_last5,recipient_name:fields.receiving_name,
  recipient_name_printed:ten.recipient_name,receiving_bank:fields.receiving_bank,
  sending_bank:fields.sending_bank,sender_name:fields.sender_name,
  transfer_content:fields.transfer_content,
  correction_source:"verified_original_image_reread"
 };
 return {ok:true,patch:{
   status:"amount_read",reason:"verified_bill_evidence_revalidated",raw_read,
   amount_vnd:verdict.amount_vnd,receiving_name:fields.receiving_name,
   receiving_account:fields.receiving_account,receiving_bank:fields.receiving_bank,
   sending_bank:fields.sending_bank,transfer_reference:fields.transfer_reference,
   transfer_at_vn:fields.transfer_at_vn,model_name:read.model,scanned_at:read.completed_at
  },recheck_required:true,ledger_written:false};
}
