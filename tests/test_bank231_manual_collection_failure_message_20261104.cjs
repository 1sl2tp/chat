'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// BANK-231: No additional bank RPCs, retries or money writes. A failed
// collection must describe the failure rather than display raw SQL statuses.
const src=fs.readFileSync('bank-report-dashboard.js','utf8');
const start=src.indexOf('function bankManualCollectionFailureMessage(');
const end=src.indexOf('\nconst localDate=',start);
assert(start>=0&&end>start,'canonical Chat bank dialog error translator is present');
const mapper=vm.runInNewContext(src.slice(start,end)+'\nbankManualCollectionFailureMessage;');
const invalid=mapper('invalid_bank_notice');
assert.match(invalid,/Agribank/);
assert.match(invalid,/Chưa thay đổi công nợ/);
assert.match(invalid,/số lẻ/);
assert.doesNotMatch(invalid,/invalid_bank_notice/);
for(const [status,expect] of [
 ['unverified_bank_credit',/không khớp/],
 ['already_collected',/Không thu lần hai/],
 ['already_auto_collected',/Không thu lần hai/],
 ['possible_manual_collection',/không trừ công nợ lần hai/],
 ['existing_collection_invalid',/không khớp/],
 ['customer_invalid',/khách hàng/i],
 ['note_required',/ít nhất 5/]
]){
 const message=mapper(status);
 assert.match(message,expect,status);
 assert(!message.includes(status),'backend codes must not appear in the finance UI');
}
assert.match(mapper('unrecognized_backend_code'),/Chưa thay đổi công nợ/);
assert(src.includes('if(!data?.ok)throw Error(bankManualCollectionFailureMessage(data?.status));'));
assert(src.includes("client.rpc('chat_bank_manual_collect',{"),'same canonical money writer');
assert(src.includes("save.disabled=true;cancel.disabled=true;feedback.textContent='Đang ghi nhận…';"));
assert(src.includes("save.disabled=false;"),'operator can retry deliberately after correcting data');
console.log('BANK-231: clear no-money-write UI for rejected manual Agribank receipts PASS');
