'use strict';
// BANK-282/283: format by 1,000 VND and send only verified prior-day bank
// transfers to those customers, never every debtor, never in tests.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations',
 '20261110222651_bank282_yesterday_verified_transfer_customer_summary_0805.sql'),'utf8');
const correction=fs.readFileSync(path.join(__dirname,'..','supabase','migrations',
 '20261110223319_bank283_manual_historical_date_and_sum_of_displayed_thousands.sql'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','bank-report-dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.source.html'),'utf8');
assert.match(sql,/CREATE OR REPLACE FUNCTION v21_private\.taphoa_bank_daily_transfer_rows/);
assert.match(sql,/JOIN public\.chat_bank_app_collection_links|FROM public\.chat_bank_app_collection_links/);
assert.match(sql,/JOIN public\.chat_bank_bill_receipts r ON r\.id=l\.receipt_id/);
assert.match(sql,/WHERE r\.status='received' AND r\.ledger_id=l\.ledger_id/);
assert.match(sql,/FROM public\.chat_bank_manual_collections m/);
assert.match(sql,/WHERE m\.mode IN \('collected','linked_existing'\)/);
assert.match(sql,/JOIN public\.taphoa_debt_ledger d ON d\.id=x\.ledger_id/);
assert.match(sql,/d\.entry_type='collection'/);
assert.match(sql,/d\.customer_account_id=x\.customer_account_id/);
assert.match(sql,/n\.is_own_transfer IS FALSE/);
assert.match(sql,/n\.bank_credit_account='2901181999999'/);
assert.match(sql,/n\.status='credit_candidate'/);
assert.match(sql,/n\.transfer_at AT TIME ZONE 'Asia\/Ho_Chi_Minh'/);
assert.match(sql,/\)::date=p_day/);
assert.doesNotMatch(sql,/FROM public\.taphoa_orders/);
assert.match(sql,/CREATE OR REPLACE FUNCTION v21_private\.taphoa_bank_daily_fmt_thousands/);
assert.match(sql,/trunc\(greatest\(coalesce\(p_amount_vnd,0\),0\)::numeric\/1000\)/);
assert.match(sql,/v21_private\.taphoa_bank_daily_body/);
assert.match(sql,/Đơn vị: 1\.000 đồng/);
assert.match(sql,/TỔNG ĐÃ NHẬN:/);
assert.match(sql,/IF v_count=0 THEN RETURN NULL/);
assert.match(sql,/v21_private\.chat_outbound_allowed\(p_customer,v_client\)/);
assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('bank-daily:'/);
assert.match(sql,/m\.sender_account_id=v_sender AND m\.client_id=v_client/);
assert.match(sql,/public\.taphoa_chat_notify_customer\(p_customer,v_sender,v_client,v_body\)/);
assert.match(sql,/IF v_time<time '08:05' OR v_time>=time '20:00'/);
assert.match(sql,/date-1/);
assert.match(sql,/cron\.schedule\('taphoa-bank-prevday-confirmed-0805-vn','5 1 \* \* \*'/);
assert.match(sql,/v21_private\.require_active_account\(p_app_session_id\)/);
assert.match(sql,/admin_only/);
assert.match(sql,/p_day>=v_today/);
assert.match(sql,/REVOKE ALL ON FUNCTION v21_private\.taphoa_bank_daily_dispatch\(\)/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.chat_bank_daily_transfer_preview\(uuid,date\)\s+FROM PUBLIC,anon/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.chat_bank_daily_transfer_send_manual\(uuid,date,uuid\)\s+TO authenticated/);
assert.match(correction,/to_char\(p_day,'DD\/MM\/YYYY'\)/);
assert.match(correction,/sum\(trunc\(e\.amount_vnd::numeric\/1000\)\)/);
assert.match(html,/data-bank-daily-summary/);
assert.match(ui,/function openDailyBankSummary\(\)/);
assert.match(ui,/client\.rpc\('chat_bank_daily_transfer_preview'/);
assert.match(ui,/client\.rpc\('chat_bank_daily_transfer_send_manual'/);
const preview=ui.indexOf("client.rpc('chat_bank_daily_transfer_preview'");
const send=ui.indexOf("client.rpc('chat_bank_daily_transfer_send_manual'");
assert(send>preview);
assert.match(ui,/window\.confirm\('Gửi thông báo đối soát ngày '/);
assert.match(ui,/send\.disabled=Boolean\(recipient\.sent\|\|!recipient\.eligible\)/);
assert.match(ui,/ui\.daily\?\.addEventListener\('click'/);
assert(!sql.includes('INSERT INTO public.taphoa_debt_ledger'),
 'Notification must never post money');
assert(!sql.includes('UPDATE public.taphoa_debt_ledger'),
 'Notification must never change debt balances');
console.log('BANK-282/283: real bank-only daily recipients, unit 1000, idempotent 08:05, manual preview PASS');