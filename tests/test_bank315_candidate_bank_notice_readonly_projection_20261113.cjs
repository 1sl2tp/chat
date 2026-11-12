'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const begin=source.indexOf('// BANK-309: deduplicate notifications BEFORE any reporting/counting/UI.');
const groupEnd=source.indexOf('function bankLineClock(',begin);
const start=source.indexOf('function bankManualNoticeFields(');
const end=source.indexOf('async function openManualBillDialog(',start);
assert(begin>0&&groupEnd>begin&&start>0&&end>start);
const code=source.slice(begin,groupEnd)+'\n'+source.slice(start,end)+
 '\n({bankCreditViewModel,bankManualNoticeFields,bankManualBillCandidateCredits,bankManualBillEvidenceRows})';
const helpers=vm.runInNewContext(code,{Number,String,Math,Map,Boolean,Array,
 bankDisplayVnd:x=>new Intl.NumberFormat('vi-VN').format(x/1000)});
const bankBody='Agribank: 19:31 12/11/2026 Tài khoản 2901181999999: +730,000VND. Nội dung giao dịch: LAI VAN TAN chuyen tien. Số dư cuối: -114,899,730VND';
const row=(id,fp)=>({notice_id:String(id),bank_time:'2026-11-12 19:31:00',
 bank_credit_account:'2901181999999',amount_vnd:730000,
 bank_body:bankBody,bank_fingerprint:fp,collection_kind:'unmatched',ledger_id:null});
const a=row(274,'f'.repeat(64)),b=row(280,'f'.repeat(64));
const bill={receipt_id:'77f71f34',reason:'bill_printed_time_missing',
 amount_vnd:730000,receiving_account:'2901181999999',bill_time:null,
 bill_ocr:{transfer_date_vn:'2026-11-12',
 sending_bank:'VPBank',transfer_content:'LAI VAN TAN chuyen tien',
 recipient_name_printed:'BUI XUAN TUNG',transfer_time_printed_vn:null}};
const exact=helpers.bankManualBillCandidateCredits(bill,[a,b],'2026-11-12');
assert.equal(exact.length,1,'same fingerprint 274+280 is ONE actual credit candidate');
assert.equal(exact[0].bank_group_count,2);
assert.equal(exact[0].bank_group_exact,true,'proof-based dedupe not guessing');
assert.equal(exact[0].bank_group_tentative,false);
const rows=helpers.bankManualBillEvidenceRows(bill,exact[0]);
const field=x=>rows.find(r=>r.label===x);
assert.equal(field('Số tiền (÷1.000)').tone,'matched');
assert.match(field('Số tiền (÷1.000)').result,/chưa liên kết/);
assert.equal(field('Ngày giao dịch').bill,'12/11/2026');
assert.equal(field('Giờ giao dịch').bank,'19:31');
assert.equal(field('Giờ giao dịch').tone,'review','missing bill hour must not use phone clock');
assert.equal(field('Nội dung chuyển khoản').tone,'matched');
assert.equal(field('Sổ đã ghi thu').tone,'pending','no collection is created by candidate match');
assert.equal(field('Thông báo Agribank phát lại').tone,'matched');
assert.equal(field('Trùng bill / trùng khoản thu').tone,'pending');
const legacy=[{...a,bank_body:undefined,bank_fingerprint:undefined},
 {...b,bank_body:undefined,bank_fingerprint:undefined}];
const weak=helpers.bankManualBillCandidateCredits(bill,legacy,'2026-11-12');
assert.equal(weak.length,1);
assert.equal(weak[0].bank_group_tentative,true);
assert.equal(helpers.bankManualBillEvidenceRows(bill,weak[0]).find(
 x=>x.label==='Thông báo Agribank phát lại').tone,'review',
 'same minute+amount alone is not a verified duplicate');
const wrongDay=helpers.bankManualBillCandidateCredits(bill,[{
 ...a,bank_time:'2026-11-13 19:31:00',bank_body:undefined
}],'2026-11-12');
assert.equal(wrongDay.length,0,'do not link a bank transfer across dates');
const diffAmount=helpers.bankManualBillCandidateCredits(bill,[{...a,amount_vnd:2022000}],
 '2026-11-12');
assert.equal(diffAmount.length,0);
const diffAccount=helpers.bankManualBillCandidateCredits(bill,[{
 ...a,bank_credit_account:'2901181999988'
}],'2026-11-12');
assert.equal(diffAccount.length,0);
const split=helpers.bankManualBillCandidateCredits(bill,[a,{
 ...b,bank_body:bankBody.replace('LAI VAN TAN','NGUYEN VAN A'),
 bank_fingerprint:'c'.repeat(64)
}],'2026-11-12');
assert.equal(split.length,2,'two different memos/fingerprints remain separate candidates');
assert(!source.includes("'Chưa có tiền NH'"),'false absence claim must be removed from normal bill panel');
const ddl=fs.readFileSync(
 'supabase/migrations/20261113064000_bank315_admin_readonly_bill_bank_evidence.sql','utf8');
assert(ddl.includes('r.raw_read AS bill_ocr'));
assert(ddl.includes('r.receiving_name'));
assert(ddl.includes('n.body AS bank_body'));
assert(ddl.includes('n.fingerprint AS bank_fingerprint'));
assert(ddl.includes('n.received_at AS bank_received_at'));
assert(ddl.includes('admin_projection'));
assert(ddl.includes('bank315_dashboard_contract_changed'));
assert(ddl.includes('bank315_credit_status_contract_changed'));
assert(!/\b(?:DELETE|INSERT|UPDATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.)?(?:taphoa_debt_ledger|taphoa_agribank_notifications|chat_bank_bill_receipts)\b/i.test(ddl),
 'read-only release MUST NOT mutate bank or ledger data');
console.log('BANK-315: real 730 bank candidate, 274/280 replay, standalone dates/time and read-only Admin projection PASS');
