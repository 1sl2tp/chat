import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const first=source.indexOf('function possibleUnlinkedBills(');
const last=source.indexOf('function detailLine(',first);
assert.ok(first>=0 && last>first);
const ctx=vm.createContext({Date,Number,String});
vm.runInContext(source.slice(first,last),ctx);
const lookup=ctx.possibleUnlinkedBills;
const credit={notice_id:'35',amount_vnd:1568000,transfer_at:'2026-10-20T02:25:00Z'};
const sent='2026-10-20T02:25:19Z';
const receipt={receipt_id:'bill-1',asset_id:'asset-1',customer_name:'C Sâm pl',
 amount_vnd:1568000,status:'amount_read',sent_at:sent,notice_id:null};
assert.equal(lookup(credit,[receipt]).length,1,'same amount, nearby image should be visible as an unverified candidate');
assert.equal(lookup(credit,[{...receipt,amount_vnd:1586000}]).length,0);
assert.equal(lookup(credit,[{...receipt,notice_id:'35',status:'received'}]).length,0);
assert.equal(lookup(credit,[{...receipt,status:'duplicate'}]).length,0);
assert.equal(lookup(credit,[{...receipt,sent_at:'2026-10-20T04:25:00Z'}]).length,0);
assert.equal(lookup(credit,[{...receipt,asset_id:''}]).length,0);
assert.equal(lookup(credit,[receipt,{...receipt,receipt_id:'bill-2',asset_id:'asset-2'}]).length,2,
 'two ambiguous bills must remain separate, never auto-assign a customer');
assert.ok(source.includes('Có bill cần kiểm tra'));
assert.ok(source.includes('Chưa đối soát · Chưa ghi thu'));
assert.ok(source.includes('void showBill(candidate)'));
assert.ok(!source.includes('rpc(\'chat_bank_app_collect\''));
console.log('BANK-183 read-only reconciliation evidence candidates PASS');
