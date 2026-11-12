'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const start=source.indexOf('function bankManualBillEvidenceRows(');
const end=source.indexOf('async function openManualBillDialog(',start);
assert(start>0&&end>start,'pure bank/bill/ledger comparison helper exists');
const {bankManualBillEvidenceRows,bankManualBillPrepareErrorMessage}=vm.runInNewContext(
 source.slice(start,end)+'\n({bankManualBillEvidenceRows,bankManualBillPrepareErrorMessage})',
 {Number,String,Boolean,Array,
  bankDisplayVnd:x=>new Intl.NumberFormat('vi-VN').format(x/1000),
  bankBillDisplayTime:x=>String(x),
  agribankDisplayTime:x=>String(x),
  ui:{date:{value:'2026-11-12'}}
 });
const bill={
 receipt_id:'77f71f34-example',customer_id:'sam-123',customer_name:'C Sâm pl',
 amount_vnd:730000,bank_name:'Agribank',
 receiving_account:'2901181999999',receiving_name:'BUI XUAN TUNG',
 status:'amount_read',report_status:'review',
 bill_time:null,transfer_reference:'BANK-REFERENCE-730'
};
const row=(rows,key)=>rows.find(x=>x.label===key);
const noNotice=bankManualBillEvidenceRows(bill,null,null,'checking');
assert.equal(noNotice.length,11,'all eleven dimensions must be shown, including absent data');
assert.equal(row(noNotice,'Ngân hàng').tone,'matched','bank identity matches only configured recipient');
assert.equal(row(noNotice,'Số tài khoản nhận').tone,'matched');
assert.equal(row(noNotice,'Tên chủ tài khoản nhận').tone,'matched');
assert.equal(row(noNotice,'Khách hàng liên kết').tone,'pending','cannot trust unstated Admin server lookup');
assert.equal(row(noNotice,'Số tiền (÷1.000)').tone,'pending','bill amount alone never confirms a bank credit');
assert.equal(row(noNotice,'Số tiền (÷1.000)').bill,'730','preserve thousands units');
assert.match(row(noNotice,'Số tiền (÷1.000)').bank,/Chưa có thông báo Agribank/);
assert.equal(row(noNotice,'Ngày và giờ giao dịch').tone,'review','unread clock requires explicit operator review');
assert.equal(row(noNotice,'Nội dung chuyển khoản').tone,'pending','no memo must not be invented');
assert.equal(row(noNotice,'Người chuyển tiền').tone,'pending');
assert.equal(row(noNotice,'Sổ đã ghi thu').tone,'pending','no DB prepare is not proof of an empty ledger');
assert.equal(row(noNotice,'Trùng bill / trùng khoản thu').tone,'pending');
assert.match(row(noNotice,'Trùng bill / trùng khoản thu').bank,/Chưa kiểm tra được/);
assert(noNotice.every(x=>!String(x.bill).includes('đ')||!x.label.includes('Số tiền')),
 'the amount label never gains a dong suffix');
assert(!noNotice.some(x=>x.result==='Không trùng'),'cannot claim a unique transfer without a server check');
const masked=bankManualBillEvidenceRows({...bill,receiving_account:'99999'},null,null,'checking');
assert.equal(row(masked,'Số tài khoản nhận').tone,'pending','account suffix only is not complete proof');
const wrong=bankManualBillEvidenceRows({...bill,receiving_account:'2901181999988',
 receiving_name:'NGUYEN VAN A'},null,null,'checking');
assert.equal(row(wrong,'Số tài khoản nhận').tone,'review');
assert.equal(row(wrong,'Tên chủ tài khoản nhận').tone,'review');
const sameAmountDifferentNotice={
 notice_id:280,bank_time:'2026-11-12 19:31:00',amount_vnd:730000,
 bank_memo:'LAI VAN TAN chuyen tien'
};
assert.equal(row(bankManualBillEvidenceRows(bill,sameAmountDifferentNotice,null,'checking'),
 'Số tiền (÷1.000)').tone,'pending',
 'same-amount bank notice must NEVER be falsely matched to a bill lacking notice_id');
const linkedBill={...bill,notice_id:280,bill_time:'2026-11-12 19:31:20',
 transfer_content:'LAI VAN TAN chuyen tien',sender_name:'LAI VAN TAN'};
const linked={...sameAmountDifferentNotice,sender_name:'LAI VAN TAN'};
const linkedRows=bankManualBillEvidenceRows(linkedBill,linked,{
 ok:true,customer_id:'sam-123',customer_name:'C Sâm pl',possible_existing:[]
},'ready');
assert.equal(row(linkedRows,'Số tiền (÷1.000)').tone,'matched');
assert.equal(row(linkedRows,'Ngày và giờ giao dịch').tone,'matched');
assert.equal(row(linkedRows,'Nội dung chuyển khoản').tone,'matched');
assert.equal(row(linkedRows,'Người chuyển tiền').tone,'matched');
assert.equal(row(linkedRows,'Khách hàng liên kết').tone,'matched');
const otherAmount=bankManualBillEvidenceRows(linkedBill,{...linked,amount_vnd:2022000},null,'checking');
assert.equal(row(otherAmount,'Số tiền (÷1.000)').tone,'review');
assert.equal(row(bankManualBillEvidenceRows({...bill,duplicate_of:'other-bill'},null,null,'checking'),
 'Trùng bill / trùng khoản thu').tone,'duplicate');
const possibleExisting=bankManualBillEvidenceRows(bill,null,{
 ok:true,customer_id:'sam-123',customer_name:'C Sâm pl',
 possible_existing:[{ledger_id:853,created_at:'2026-11-12 19:31'}]
},'ready');
assert.equal(row(possibleExisting,'Trùng bill / trùng khoản thu').tone,'duplicate');
assert.match(row(possibleExisting,'Trùng bill / trùng khoản thu').bank,/1 khoản thu/);
assert.equal(row(bankManualBillEvidenceRows(bill,null,{
 ok:true,customer_id:'wrong',customer_name:'Khách khác',possible_existing:[]
},'ready'),'Khách hàng liên kết').tone,'review');
assert.match(bankManualBillPrepareErrorMessage({code:'PGRST202',message:'Could not find the function...'}),
 /chưa triển khai hàm đối chiếu/);
assert.match(bankManualBillPrepareErrorMessage({code:'PGRST202'}),
 /không phải kết luận bill sai/);
assert.match(bankManualBillPrepareErrorMessage({message:'Other failed'}),/Chưa ghi thu/);

const ui=source.slice(end,source.indexOf('async function openCollectionDialog(',end));
assert(ui.includes("client.rpc('chat_bank_bill_manual_prepare'"));
assert(ui.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(ui.includes("refreshEvidence(null,'error')"),'DB failure must redraw verified-vs-unknown matrix');
assert(ui.includes("info.textContent=bankManualBillPrepareErrorMessage(error)"),
 'no raw PostgREST function/cache error in the operator UI');
assert(ui.includes("note.disabled=true;verified.disabled=true;save.disabled=true;"),
 'missing server RPC cannot submit or attest a debit');
assert(ui.includes("note.value='';"),'do not pre-certify bank history the Admin has not checked');
assert(ui.includes('const refreshEvidence='),'comparison stays live through check/response/error');
assert(ui.includes("comparison.setAttribute('role','table')"),'matrix remains accessible');
assert(ui.includes("String(bill.notice_id||'')"),'only a directly linked notice may be compared');
assert(ui.includes("String(n.notice_id)===noticeId"),'no same-amount guessing');
assert(!source.slice(start,end).includes(".rpc("),'pure helper never books money');
assert(css.includes('BANK-314: evidence-first reconciliation'));
assert(css.includes('.bank-bill-compare-row[data-proof-tone="matched"]'));
assert(css.includes('.bank-bill-compare-row[data-proof-tone="pending"]'));
assert(css.includes('.bank-bill-compare-row[data-proof-tone="review"]'));
assert(css.includes('.bank-bill-compare-row[data-proof-tone="duplicate"]'));
assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'mobile side-by-side sources');
assert(css.includes("content:attr(data-source)"),'phone cells remain labeled');
assert(css.includes('max-height:calc(100dvh - max(12px,env(safe-area-inset-top)))'));
console.log('BANK-314: eleven-source comparison, no fictitious bank credit, explicit duplicate review and fail-closed missing prepare RPC PASS');
