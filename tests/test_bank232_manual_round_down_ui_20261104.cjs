'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// BANK-232: 16,000,008 in the bank remains evidence. Manual collection
// intentionally records 16,000,000; 8 dong must be shown, not erased.
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const begin=source.indexOf('function bankManualBookedPreview(');
const end=source.indexOf('\nconst localDate=',begin);
assert(begin>=0&&end>begin,'canonical preview helper available');
const preview=vm.runInNewContext(source.slice(begin,end)+'\nbankManualBookedPreview;',{
 Number,Math,Intl
});
for(const [input,booked,ignored] of [
 [16_000_008,16_000_000,8],[16_000_000,16_000_000,0],
 [570050,570000,50],[1999,1000,999]
]){
 const x=preview(input);
 assert.equal(x.bankVnd,input);
 assert.equal(x.bookedVnd,booked);
 assert.equal(x.ignoredVnd,ignored);
 assert.equal(booked+ignored,input);
}
for(const invalid of [null,0,999,-1000,Number.MAX_SAFE_INTEGER+2,Infinity,'not money']){
 assert.equal(preview(invalid),null,'cannot submit invalid or sub-thousand bank amount');
}
const dialog=source.slice(source.indexOf('async function openCollectionDialog(bank){'),
 source.indexOf('\nfunction closeViewer(){'));
assert(dialog.includes("money(accounting.bookedVnd)+' · Agribank #'"),'label uses recorded amount');
assert(dialog.includes("'Ngân hàng thực nhận: '+bankManualVnd(accounting.bankVnd)"));
assert(dialog.includes("'Ghi thu công nợ: '+bankManualVnd(accounting.bookedVnd)"));
assert(dialog.includes("' · Bỏ '+accounting.ignoredVnd+' đ lẻ"),'visible bank discrepancy');
assert(dialog.includes("save.textContent='Thu '+money(accounting.bookedVnd)"),'submit amount consistent');
assert(dialog.includes('Number(data.amount_vnd)!==accounting.bankVnd'),'stale credit must fail closed');
assert(dialog.includes("client.rpc('chat_bank_manual_collect',{"),'single existing finance RPC owner');
assert(dialog.includes("if(!data?.ok)throw Error(bankManualCollectionFailureMessage(data?.status))"));
assert(!dialog.includes("client.rpc('taphoa_debt_transaction'"),'do not create a second receipt from Chat');
console.log('BANK-232: exact evidence, whole-thousand accounting, delta visibility and single RPC PASS');
