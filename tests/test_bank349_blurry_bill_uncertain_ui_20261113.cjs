'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('bank-report-dashboard.js','utf8');
const a=src.indexOf('function bankBillImageUncertainty(row){');
const b=src.indexOf('function scanIssueLabel(',a);
assert(a>0&&b>a,'OCR uncertainty helpers must exist');
const fn=vm.runInNewContext(src.slice(a,b)+'\n({bankBillImageUncertainty,bankBillUncertainDescription});');
const damaged={
  receipt_id:'af567fd8-ee96-4c63-b53b-69fbba0ef66d',
  report_status:'review',reason:'bill_recipient_account_conflict',
  bill_ocr:{uncertainty:'Ảnh chụp màn hình thiết bị khác, phần giờ không đọc được rõ.',
    recognition_case:'no_printed_clock',transfer_time_printed_vn:null,
    transfer_date_printed_vn:'11/11/2026',transfer_date_vn:'2026-11-11'}
};
assert.equal(fn.bankBillImageUncertainty(damaged),true);
const label=fn.bankBillUncertainDescription(damaged);
assert.match(label,/Ảnh bill khó đọc/);
assert.match(label,/AI chưa xác minh chắc chắn/);
assert.match(label,/chưa tự thu/);
assert.doesNotMatch(label,/khách chuyển nhầm\./);
const clean={...damaged,bill_ocr:{uncertainty:'',recognition_case:'no_printed_clock'}};
assert.equal(fn.bankBillImageUncertainty(clean),false,'clear mismatch cannot be waived');
assert.equal(fn.bankBillImageUncertainty({...damaged,reason:'amount_scan_gemini_http_503'}),false);
assert(src.includes("!isBank&&bankBillImageUncertainty(row)?'Ảnh khó đọc · Cần soát'"));
assert(src.includes("if(bankBillImageUncertainty(row))reason=bankBillUncertainDescription(row);"));
assert(src.includes("else if(row.reason==='bill_recipient_account_conflict')reason="),
 'Clear disagreement must retain existing review warning');
// No changes to SQL, stored OCR, matching or collection. Presentation only.
assert(!src.slice(a,b).includes('chat_bank_app_collect'));
console.log('BANK-349 PASS: unreadable photo labeled uncertain; clear conflict kept; no ledger write');
