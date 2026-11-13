'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('bank-report-dashboard.js','utf8');
const begin=src.indexOf('function bankManualBillSuggestedNote(');
const end=src.indexOf('function bankManualBillPrepareErrorMessage(',begin);
assert(begin>0&&end>begin);
const builder=vm.runInNewContext(src.slice(begin,end)+'\n;bankManualBillSuggestedNote',{
 bankSimpleTenFieldRows:()=>[
 {label:'Mã tham chiếu',tone:'pending',result:'Thông báo không kèm mã NAPAS'},
 {label:'Giờ giao dịch',tone:'review',result:'Thiếu giờ trên bill'},
 {label:'Tên tài khoản nhận',tone:'matched',result:'Đã khớp'},
 {label:'Số tiền',tone:'pending',result:'Chưa có tiền NH cùng điều kiện'},
 {label:'Ngân hàng nhận',tone:'review',result:'Khác ngân hàng nhận'}
 ]});
const withBank=builder({receipt_id:'77f71f34'},{notice_id:'274'});
const noBank=builder({receipt_id:'95bc6fbc'},null);
assert(withBank.includes('Ưu tiên đỏ: Giờ giao dịch: Thiếu giờ trên bill'));
assert(withBank.includes('Ngân hàng nhận: Khác ngân hàng nhận'));
assert(withBank.indexOf('Ưu tiên đỏ')<withBank.indexOf('Cần đối chiếu'));
assert(withBank.indexOf('Giờ giao dịch')<withBank.indexOf('Mã tham chiếu'));
assert(!withBank.includes('Tên tài khoản nhận: Đã khớp'));
assert.match(noBank,/Chưa có thông báo Agribank khớp/);
assert.match(noBank,/Admin kiểm tra tiền thực nhận/);
assert(!noBank.includes('đã nhận tiền thành công'));
assert(withBank.length<=1000);
const dialog=src.slice(src.indexOf('async function openManualBillDialog('),src.indexOf('async function openCollectionDialog('));
assert(dialog.includes('note.value=bankManualBillSuggestedNote(bill,comparisonNotice)'));
assert(dialog.includes('verified.required=true'));
assert(dialog.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(dialog.includes("p_note:'Agribank · '+note.value.trim()"));
assert(!/note\.disabled\s*=\s*false;\s*verified\.checked\s*=\s*true/.test(dialog));
console.log('BANK-322 editable note prioritizes red > yellow, never authorizes financial writes PASS');
