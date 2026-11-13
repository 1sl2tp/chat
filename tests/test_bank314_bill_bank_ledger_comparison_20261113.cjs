'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const start=source.indexOf('function bankManualNoticeFields(');
const end=source.indexOf('async function openExistingManualBillReviewDialog(',start);
assert(start>0&&end>start,'read-only bill/bank comparison helpers exist');
const {bankManualBillEvidenceRows,bankManualBillPrepareErrorMessage,bankManualNoticeFields}=vm.runInNewContext(
 source.slice(start,end)+'\n({bankManualBillEvidenceRows,bankManualBillPrepareErrorMessage,bankManualNoticeFields})',
 {Number,String,Boolean,Array,Math,bankCreditViewModel:r=>r,
  bankDisplayVnd:x=>new Intl.NumberFormat('vi-VN').format(x/1000)}
);
const row=(rows,key)=>rows.find(x=>x.label===key);
const bill={
 receipt_id:'77f71f34-example',customer_id:'sam-123',customer_name:'C Sâm pl',
 amount_vnd:730000,receiving_account:'2901181999999',
 receiving_name:'BUI XUAN TUNG',reason:'bill_printed_time_missing',
 transfer_reference:'NAPAS_INPLIBFTI2ZK14AV',report_status:'review',ledger_id:null,
 bill_ocr:{
  sending_bank:'VPBank',recipient_name_printed:'BUI XUAN TUNG',
  transfer_date_printed_vn:'12/11/2026',transfer_time_printed_vn:null,
  transfer_content:'LAI VAN TAN chuyen tien',
  sender_name:'LAI VAN TAN'
 }
};
const blank=bankManualBillEvidenceRows(bill,null,null,'checking');
assert.equal(blank.length,15,'separate date/clock and independent notification-replay vs ledger-duplicate evidence');
assert.equal(row(blank,'Ngân hàng gửi').bill,'VPBank');
assert.equal(row(blank,'Ngân hàng nhận').tone,'pending','bill does not explicitly name receiving bank');
assert.equal(row(blank,'Số tài khoản nhận').tone,'matched','config match ≠ received money');
assert.equal(row(blank,'Tên chủ TK nhận').tone,'matched');
assert.equal(row(blank,'Số tiền (÷1.000)').bill,'730');
assert.equal(row(blank,'Số tiền (÷1.000)').tone,'pending','a screenshot without bank candidate never proves receipt');
assert.equal(row(blank,'Ngày giao dịch').bill,'12/11/2026');
assert.equal(row(blank,'Giờ giao dịch').tone,'review','phone status clock cannot fill printed bill time');
assert.equal(row(blank,'Giờ giao dịch').bill,'Bill không in giờ giao dịch');
assert.equal(row(blank,'Nội dung chuyển khoản').bill,'LAI VAN TAN chuyen tien');
assert.equal(row(blank,'Sổ đã ghi thu').tone,'pending','no server prepare cannot prove an empty ledger');
assert(!blank.some(x=>x.result==='Không trùng'));
const body='Agribank: 19:31 12/11/2026 Tài khoản 2901181999999: +730,000VND. Nội dung giao dịch: LAI VAN TAN chuyen tien. Số dư cuối: -114,899,730VND';
const notice={
 notice_id:'274',amount_vnd:730000,bank_credit_account:'2901181999999',
 bank_time:'2026-11-12 19:31:00',bank_body:body,
 bank_group_notice_ids:['274','280'],bank_group_exact:true
};
const parsed=bankManualNoticeFields(notice);
assert.equal(parsed.hour,'19:31');
assert.equal(parsed.date,'12/11/2026');
assert.equal(parsed.memo,'LAI VAN TAN chuyen tien');
assert.equal(parsed.balance,'-114,899,730');
const candidate=bankManualBillEvidenceRows(bill,notice,null,'checking');
assert.equal(row(candidate,'Số tiền (÷1.000)').bank,'730');
assert.match(row(candidate,'Số tiền (÷1.000)').result,/chưa liên kết/i);
assert.equal(row(candidate,'Ngày giao dịch').tone,'matched');
assert.equal(row(candidate,'Giờ giao dịch').tone,'review');
assert.equal(row(candidate,'Giờ giao dịch').bank,'19:31');
assert.equal(row(candidate,'Nội dung chuyển khoản').tone,'matched');
assert.equal(row(candidate,'Số dư cuối Agribank').bank,'-114,899,730');
assert.equal(row(candidate,'Thông báo Agribank phát lại').tone,'matched',
 'two exact-replay notifications are one transfer, not a duplicate collection');
assert.equal(row(candidate,'Sổ đã ghi thu').tone,'pending');
assert.equal(row(bankManualBillEvidenceRows(bill,{...notice,bank_body:body.replace(
 'LAI VAN TAN','NGUYEN VAN B')},null,'checking'),'Nội dung chuyển khoản').tone,'review');
assert.equal(row(bankManualBillEvidenceRows(bill,{...notice,amount_vnd:123000},null,'checking'),
 'Số tiền (÷1.000)').tone,'review');
assert.equal(row(bankManualBillEvidenceRows({...bill,receiving_account:'2901181999988'},notice,null,'checking'),
 'Số tài khoản nhận').tone,'review');
assert.equal(row(bankManualBillEvidenceRows({...bill,duplicate_of:'duplicate'},null,null,'checking'),
 'Trùng bill / trùng khoản thu').tone,'duplicate');
const prev={ok:true,customer_id:'sam-123',customer_name:'C Sâm pl',
 possible_existing:[{ledger_id:853}]};
assert.equal(row(bankManualBillEvidenceRows(bill,notice,prev,'ready'),
 'Trùng bill / trùng khoản thu').tone,'duplicate');
assert.equal(row(bankManualBillEvidenceRows(bill,notice,{...prev,customer_id:'different'},'ready'),
 'Khách hàng liên kết').tone,'review');
assert.match(bankManualBillPrepareErrorMessage({code:'PGRST202'}),/chưa triển khai hàm đối chiếu/);
assert.match(bankManualBillPrepareErrorMessage({message:'failed'}),/Chưa ghi thu/);
const ui=source.slice(end,source.indexOf('async function openCollectionDialog(',end));
for(const token of ["client.rpc('chat_bank_bill_manual_prepare'","client.rpc('chat_bank_bill_manual_collect'",
 "bankManualBillCandidateCredits(bill,current?.bank_credits,ui.date.value)",
 "comparison.setAttribute('role','table')",
 "['Thông tin','Bill','Agribank (thông báo)','Đánh giá bill']",
 "refreshEvidence(null,'error')","note.disabled=true;verified.disabled=true;save.disabled=true;"]){
 assert(ui.includes(token),'missing safe dialog contract '+token);
}
assert(!source.slice(start,end).includes('.rpc('),'pure evidence helper performs no finance writes');
assert(css.includes('BANK-314: evidence-first reconciliation'));
assert(css.includes('.bank-bill-compare-row[data-proof-tone="matched"]'));
assert(css.includes('.bank-bill-compare-row[data-proof-tone="pending"]'));
assert(css.includes('.bank-bill-compare-row[data-proof-tone="review"]'));
assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
console.log('BANK-314/315: 4 evidence columns, real 730 bank candidate, bill missing hour, idempotent replay and DB fail closed PASS');
