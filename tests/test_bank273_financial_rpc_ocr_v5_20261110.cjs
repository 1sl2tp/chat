'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const sql=readFileSync(join(__dirname,'..','supabase','migrations',
 '20261110134955_bank273_accept_bill_ocr_v5_and_verify_manual_bank_timestamps.sql'),'utf8');
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.chat_bank_app_collect\(/);
assert.match(sql,/SECURITY DEFINER/);
assert.match(sql,/r\.raw_read->>'rule_version' not in \('bank_bill_amount_v4_20261018','bank_bill_amount_v5_20261110'\)/);
assert.match(sql,/r\.raw_read\#>>'\{manual_datetime_correction,source\}' <> 'independent_agribank_credit_notification'/);
assert.match(sql,/r\.raw_read\#>>'\{manual_datetime_correction,bank_notice_id\}' is distinct from n\.id::text/);
assert.match(sql,/verified_bill_memo:=upper\(regexp_replace\(extensions\.unaccent/);
assert.match(sql,/verified_bank_memo:=upper\(regexp_replace\(extensions\.unaccent/);
assert.match(sql,/length\(verified_bill_memo\)<12/);
assert.match(sql,/manual_bank_time_memo_unverified/);
assert.match(sql,/r\.raw_read#>>'\{match_preview,status\}'<>'candidate_unique'/);
assert.match(sql,/r\.raw_read#>>'\{match_preview,notification_id\}' is distinct from p_notification_id::text/);
assert.match(sql,/r\.transfer_at_vn::date <> \(now\(\) at time zone 'Asia\/Ho_Chi_Minh'\)::date/);
assert.match(sql,/abs\(extract\(epoch from\(image_at-transaction_at\)\)\)>60/);
assert.match(sql,/select 1 from public\.chat_bank_manual_collections/);
assert.match(sql,/select 1 from public\.chat_bank_app_collection_links/);
assert.match(sql,/select 1 from public\.taphoa_debt_ledger/);
assert.match(sql,/pg_advisory_xact_lock/);
assert.match(sql,/insert into public\.taphoa_debt_ledger/);
assert.match(sql,/insert into public\.chat_bank_app_collection_links/);
assert.match(sql,/update public\.chat_bank_bill_receipts/);
assert.doesNotMatch(sql,/GRANT\s+EXECUTE\s+ON\s+FUNCTION.*\b(?:anon|authenticated|PUBLIC)\b/i,
 'Auto-collection RPC must not be exposed to browser roles');
console.log('BANK-273: v5 accepted with manual-bank-memo proof, current-day, and duplicate financial guards PASS');
