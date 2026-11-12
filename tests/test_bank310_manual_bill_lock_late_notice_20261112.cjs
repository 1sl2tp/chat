'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(base,'bank-report-dashboard.js'),'utf8');
const sql=fs.readFileSync(path.join(base,'supabase/migrations/20261112220000_bank310_manual_bill_collection_late_credit_guard.sql'),'utf8');

// Cô Ngọc 8m has an OCR bill but NO bank notice ID. The button must be on
// the bill itself and the old bank-notice-specific RPC must not be reused.
const billArea=ui.slice(ui.indexOf('function detailLine('),ui.indexOf('// BANK-268:'));
assert(billArea.includes("'Thu thủ công cho '+String(row.customer_name"),
 'Bill detail must name the exact customer, not an empty bank notice ID');
assert(billArea.includes('row.receipt_id&&row.customer_id'));
assert(billArea.includes('!row.ledger_id&&!manualEvidence'),
 'Never offer another manual action to an already paid or attributed bill');
assert(billArea.includes("['amount_read','review'].includes(String(row.status||''))"),
 'A non-bill or received receipt must never be actionable');
assert(billArea.includes('openManualBillDialog(row)'));
const dialog=ui.slice(ui.indexOf('async function openManualBillDialog('),
 ui.indexOf('function openCollectionDialog('));
assert(dialog.includes("client.rpc('chat_bank_bill_manual_prepare'"));
assert(dialog.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(dialog.includes('p_receipt_id:String(bill.receipt_id)'));
assert(dialog.includes('p_customer_id:String(prepared.customer_id)'));
assert(dialog.includes('if(data.ledger_id||data.recorded||data.status==='));
assert(dialog.includes('ledgerSelect?Number(ledgerSelect.value):null'));
assert(dialog.includes('!verified.checked'),'Admin must confirm bank history directly');
assert(dialog.includes('save.disabled=true'),'Not enabled until fresh server prepare');
assert(dialog.includes('Chưa ghi thu.'),'Missing migration must fail closed');
assert(!dialog.includes("client.rpc('chat_bank_manual_collect'"),
 'No absent bank notification may be sent to the original bank-notice collector');

// Two-way linkage is transactionally unique, even if the same Admin clicks
// twice or notification arrives later on a second Android device.
assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.chat_bank_bill_manual_collections/);
assert.match(sql,/receipt_id uuid PRIMARY KEY/);
assert.match(sql,/ledger_id bigint NOT NULL UNIQUE/);
assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON public\.chat_bank_bill_manual_collections FROM PUBLIC,anon,authenticated/);
assert.match(sql,/v21_private\.require_active_account\(p_app_session_id\)/);
assert.match(sql,/a\.role='admin'/);
assert.match(sql,/pg_advisory_xact_lock\(17812026\)/);
assert.match(sql,/WHERE id=p_receipt_id FOR UPDATE/);
assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('taphoa-money:'\|\|p_customer_id::text,0\)\)/);
assert.match(sql,/IF v_r\.status='received' AND v_r\.ledger_id IS NOT NULL/);
assert.match(sql,/IF v_r\.customer_account_id IS DISTINCT FROM p_customer_id/);
assert.match(sql,/raw_read->>'transfer_success_visible'<>'true'/);
assert.match(sql,/v_r\.receiving_account IS DISTINCT FROM '2901181999999'/);
assert.match(sql,/<>'BUI XUAN TUNG'/);
assert.match(sql,/possible_existing_manual_collection/);
assert.match(sql,/existing_ledger_invalid/);
assert.match(sql,/bill_reference_already_collected/);
assert.match(sql,/UPDATE public\.chat_bank_bill_receipts[\s\S]*SET status='received',reason='manual_agribank_bill_confirmed'/);
assert.match(sql,/ledger_id=v_id/);
assert.match(sql,/client_id|taphoa:bank-bill-manual:/);
assert.match(sql,/bank310_manual_bill_financially_immutable/);
assert.match(sql,/NEW\.ledger_id IS DISTINCT FROM OLD\.ledger_id/);
assert.match(sql,/NEW\.customer_account_id IS DISTINCT FROM OLD\.customer_account_id/);

// The lock exists in BOTH the automatic and manual-notice handlers.
// No new (or duplicate) movement may be written by an independent late push.
assert(sql.includes("'public.chat_bank_app_collect(uuid,bigint)'::regprocedure"));
assert(sql.includes("'public.chat_bank_manual_collect(uuid,bigint,uuid,text,bigint)'::regprocedure"));
assert.equal(sql.split("late_bank_notice_previously_manually_collected").length>=3,true);
assert.match(sql,/prior\.amount_vnd=n\.amount_vnd/);
assert.match(sql,/prior\.amount_vnd=v_notice\.amount_vnd/);
assert.match(sql,/bank310_credit_registry_contract_changed/);
assert.match(sql,/HAVING count\(\*\)=1/);
assert.match(sql,/bank310_summary_anchor_changed/);
assert.match(sql,/manual_agribank_bill_confirmed/);
assert.match(sql,/notice_sent/);

// Nothing is posted by this test or by a bill image arriving alone.
assert(!/CALL\s+public\.chat_bank_bill_manual_collect|SELECT\s+public\.chat_bank_bill_manual_collect\s*\(/i.test(sql));
console.log('BANK-310: named-customer manual bill action, admin attestation, immutable bill↔ledger and late bank guards PASS');
