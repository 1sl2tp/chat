'use strict';
// BANK-351: no bank notifications, ledger edits or real messages in tests.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('bank-report-dashboard.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261114073500_bank351_manual_paid_bill_reconciliation.sql','utf8');
const a=src.indexOf('function bankCreditViewModel(');
const b=src.indexOf('function bankCreditGroupingStatus(',a);
const c=src.indexOf('function vietnamBusinessDay(');
const d=src.indexOf('function detailLine(',c);
assert(a>0&&b>a&&c>b&&d>c,'must keep isolated pure presentation helpers');
const ctx=vm.createContext({Date,Number,String,Map,Set,Array,Math,JSON,RegExp});
vm.runInContext(src.slice(a,b)+'\n'+src.slice(c,d),ctx);
const match=ctx.bankExistingManualBillCandidates;
const bill={receipt_id:'r492',customer_id:'sam',status:'review',report_status:'review',
 reason:'bill_recipient_account_conflict',sent_at:'2026-11-13T13:25:25Z',
 amount_vnd:492000,receiving_account:'0000099999',ledger_id:null};
const bank={notice_id:'288',customer_id:'sam',amount_vnd:492000,
 transfer_at:'2026-11-13T13:10:00Z',bank_time:'2026-11-13 20:10:00',
 collection_kind:'manual_collected',ledger_id:'885'};
const state={bills:[bill],bank_credits:[bank]};
assert.equal(match(bill,state)[0]?.ledger_id,'885',
 'A booked, same-customer same-amount bank credit is a review candidate, not an automatic match');
for(const bad of [
 {...bank,customer_id:'other'},{...bank,amount_vnd:490000},
 {...bank,ledger_id:null},{...bank,collection_kind:'unmatched'},
 {...bank,transfer_at:'2026-11-12T13:10:00Z',bank_time:'2026-11-12 20:10:00'}
]){
 assert.equal(match(bill,{bills:[bill],bank_credits:[bad]}).length,0);
}
assert.equal(match(bill,{...state,bills:[bill,{...bill,receipt_id:'r493'}]}).length,0,
 'competing same-customer bill must block automatic suggestion');
assert.equal(match({...bill,ledger_id:'885'},state).length,0,'already booked bill not suggested');
assert.equal(match(bill,{...state,bank_credits:[bank,{...bank,notice_id:'289',ledger_id:'886'}]}).length,0,
 'two different collected bank credits require manual investigation');

for(const token of [
 'Đã thu tay · Đã soát bill','Đã thu tay · Chưa soát bill',
 'Soát bill với khoản đã thu','p_original_checked:true',
 "p_receipt_id:String(bill.receipt_id)","p_notice_id:Number(credit.notice_id)",
 "data.debt_changed!==false","closeReviewDialog();await reload();"
])assert(src.includes(token),token);
assert(/manualReviewed\?'Đã thu tay · Đã soát bill'/.test(src),'only confirmed bill label');
assert(src.includes("row.reason==='manual_bank_bill_reviewed'"),'server verified receipt state required');
assert(!src.includes("rpc('chat_bank_app_collect'"),'no auto bank collect from UI');

for(const token of [
 'public.chat_bank_confirm_existing_manual_bill(',
 'v21_private.require_active_account(p_app_session_id)',
 'p_original_checked IS DISTINCT FROM TRUE',
 'pg_advisory_xact_lock(17812026)',
 "v_manual.ledger_id","v_ledger.entry_type<>'collection'",
 "other.customer_account_id=v_receipt.customer_account_id",
 "other.status IN ('review','amount_read','received')",
 "reason='manual_bank_bill_reviewed'","mode,note)",
 "PERFORM v21_private.chat_bank_report_touch()",
 "'debt_changed',false,'notice_sent',false",
 "GRANT EXECUTE ON FUNCTION public.chat_bank_confirm_existing_manual_bill"
])assert(sql.includes(token),token);
assert(!/INSERT INTO public\.taphoa_debt_ledger|UPDATE public\.taphoa_debt_ledger|taphoa_chat_notify_customer|chat_bank_app_collect\(/i.test(sql),
 'review cannot book money or send notifications');
console.log('BANK-351: manual paid bill review (ledger-only link, no double collection) SOURCE PASS');
