import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeBillRecipientName,isExpectedBillRecipientName,
  readV4Fields,validateVisionRead,SYSTEM_PROMPT}
 from "../supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs";
import {previewBillAppMatch}
 from "../supabase/functions/v21-bank-bill-event/bill-app-preview.mjs";

// BANK-297: a beneficiary identity is not a bank posting instruction.
const accepted=[
  "BUI XUAN TUNG","Bùi Xuân Tùng","bùi xuân tùng",
  "  BÙI   XUÂN    TÙNG  ","Bùi Xuân Tùng",
  "BUI\tXUAN\nTUNG",
];
for(const name of accepted){
 assert.equal(normalizeBillRecipientName(name),"BUI XUAN TUNG",name);
 assert.equal(isExpectedBillRecipientName(name),true,name);
}
const rejected=[
  "BUI XUAN","BUI XUAN THUNG","XUAN BUI TUNG",
  "BUI XUAN TUNG ANH","BUI XUAN TUNG 99999","BUIXUANTUNG",
  "BUI XUAN TUNG.","BUI - XUAN TUNG","BUI XUAN TOAN",
  "BUI XUAN TUN","BUI XUAN TUNG NGUOI GUI",
];
for(const name of rejected){
 assert.equal(isExpectedBillRecipientName(name),false,name);
}
for(const name of [undefined,null,123,{},[]])
 assert.equal(isExpectedBillRecipientName(name),false);

const raw={
 image_type:"successful_transfer_receipt",image_layout:"app_screenshot",
 transaction_selection:"single_detail",transaction_nature:"transfer",
 transfer_success_visible:true,amount_clear:true,
 amount_role:"transfer_amount",amount_text:"3.000.000đ",amount_vnd:3000000,
 recipient_name:"Bùi Xuân Tùng",recipient_account_visible:"2901181999999",
 recipient_account_last5:"99999",receiving_bank:"Agribank",
 transaction_datetime_vn:"2026-11-12 15:33:28",
 transfer_date_vn:"2026-11-12",transfer_date_printed_vn:"12/11/2026",
 transfer_time_printed_vn:"15:33:28",
 transfer_content:"NGUYEN THI OANH chuyen tien"
};
assert.equal(validateVisionRead(raw).status,"amount_read");
const fields=readV4Fields(raw,{sentAt:"2026-11-12T08:33:44Z"});
assert.equal(fields.receiving_name,"BUI XUAN TUNG");
const notice={
 id:270,package_name:"com.vnpay.Agribank3g",status:"credit_candidate",
 amount_vnd:3000000,is_own_transfer:false,
 body:"Agribank: 15:33 12/11/2026 Tài khoản 2901181999999: +3,000,000VND. Nội dung giao dịch:  MB(046501)(NGUYEN THI OANH chuyen tien). Số dư cuối: -1VND"
};
const bill={...fields,media_asset_id:"synthetic-recipient-name",
 status:"amount_read",amount_vnd:3000000,
 sent_at:"2026-11-12T08:33:44Z",
 requires_bank_memo:false,transaction_nature:"transfer"};
const result=previewBillAppMatch(bill,[notice],[],Date.parse("2026-11-12T09:00:00Z"));
assert.equal(result.status,"candidate_unique");
for(const name of accepted){
 const b={...bill,receiving_name:name};
 assert.equal(previewBillAppMatch(b,[notice],[],Date.parse("2026-11-12T09:00:00Z")).status,
   "candidate_unique",name);
}
for(const name of rejected){
 const r=previewBillAppMatch({...bill,receiving_name:name},
  [notice],[],Date.parse("2026-11-12T09:00:00Z"));
 assert.equal(r.status,"review",name);
 assert.equal(r.reason,"recipient_name_conflict",name);
}
// Name written by payer does not become the beneficiary field when OCR could
// not read the actual recipient (no autofill from memo or sender).
const senderOnly=readV4Fields({...raw,recipient_name:null,
 sender_name:"BUI XUAN TUNG",transfer_content:"BUI XUAN TUNG chuyen tien"},
 {sentAt:"2026-11-12T08:33:44Z"});
assert.equal(senderOnly.receiving_name,null);
assert.equal(readV4Fields({...raw,recipient_name:null},{}).receiving_name,null);
assert.match(SYSTEM_PROMPT,/Chữ BUI XUAN TUNG ở Người gửi/);
assert.match(SYSTEM_PROMPT,/recipient_name=null/);
const index=readFileSync(new URL("../supabase/functions/v21-bank-bill-event/index.ts",import.meta.url),"utf8");
assert.match(index,/recipient_name_printed:typeof parsed\?\.recipient_name/);

// Staged DB source: compare with prior canonical RPC and require the ONLY
// predicate change is strict, accent-insensitive recipient-name equality.
// This test never calls the production RPC or posts any money.
const migration=readFileSync(new URL("../docs/proposed-sql/BANK_297_strict_unaccent_beneficiary_name_NOT_APPLIED.sql",import.meta.url),"utf8");
const previous=readFileSync(new URL("../supabase/migrations/20261110134955_bank273_accept_bill_ocr_v5_and_verify_manual_bank_timestamps.sql",import.meta.url),"utf8");
const functionMarker="CREATE OR REPLACE FUNCTION public.chat_bank_app_collect";
const newFunction=migration.slice(migration.indexOf(functionMarker));
const oldFunction=previous.slice(previous.indexOf(functionMarker));
const newPredicate=/  -- BANK-297: Compare the complete beneficiary name only,[\s\S]*?then return jsonb_build_object\('ok',false,'status','recipient_name_conflict'\); end if;/;
const oldPredicate=/  if nullif\(btrim\(coalesce\(r\.receiving_name,''\)\),''\) is not null[\s\S]*?then return jsonb_build_object\('ok',false,'status','recipient_name_conflict'\); end if;/;
const oldCondition=oldFunction.match(oldPredicate)?.[0];
assert.ok(oldCondition,"old canonical predicate must exist");
assert.equal(newFunction.replace(newPredicate,oldCondition),oldFunction,
  "No financial guard or privilege may change aside from the recipient name predicate");
assert.match(newFunction,/extensions\.unaccent\(r\.receiving_name\)/);
assert.match(newFunction,/SECURITY DEFINER/);
assert.match(newFunction,/pg_advisory_xact_lock/);
assert.match(newFunction,/r\.raw_read#>>'\{match_preview,status\}'<>'candidate_unique'/);
assert.match(newFunction,/insert into public\.chat_bank_app_collection_links/);
assert.doesNotMatch(newFunction,/GRANT\s+EXECUTE\s+ON\s+FUNCTION.*\b(?:anon|authenticated|PUBLIC)\b/i);
console.log("BANK-297: exact accent-insensitive beneficiary, sender/memo isolation, SQL guard parity PASS");
