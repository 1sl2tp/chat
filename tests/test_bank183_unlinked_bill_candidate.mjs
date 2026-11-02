import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const first=source.indexOf('function vietnamBusinessDay(');
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
assert.equal(lookup(credit,[{...receipt,sent_at:'2026-10-20T04:25:00Z'}]).length,1,
 'a later same-day second screenshot may be shown as supporting evidence, not counted as a new transfer');
assert.equal(lookup(credit,[{...receipt,sent_at:'2026-10-21T04:25:00Z'}]).length,0,
 'different-day upload must not be suggested as the same-day proof');
assert.equal(lookup(credit,[{...receipt,status:'review',amount_vnd:null,
 reason:'multiple_transactions_ambiguous',sent_at:'2026-10-20T02:27:22Z'}]).length,1,
 'multi-row statement near bank credit is review evidence only, not a bill');
assert.equal(lookup(credit,[{...receipt,asset_id:''}]).length,0);
assert.equal(lookup(credit,[receipt,{...receipt,receipt_id:'bill-2',asset_id:'asset-2'}]).length,2,
 'two ambiguous bills must remain separate, never auto-assign a customer');
// BANK-183-VN-DAY-20261102: UTC dates may disagree across a single VN day.
const afterMidnight={...credit,transfer_at:'2026-11-01T17:30:00Z'}; // 00:30 Nov 2 VN.
assert.equal(lookup(afterMidnight,[{...receipt,sent_at:'2026-11-02T16:00:00Z'}]).length,1,
 'late same-Vietnam-day bill must remain visible across the UTC date boundary');
assert.equal(lookup(afterMidnight,[{...receipt,sent_at:'2026-11-02T17:10:00Z'}]).length,0,
 'next Vietnam day must not count as same-day evidence even if UTC day changed');
const beforeMidnight={...credit,transfer_at:'2026-11-02T16:30:00Z'}; // 23:30 Nov 2 VN.
assert.equal(lookup(beforeMidnight,[{...receipt,sent_at:'2026-11-02T17:30:00Z'}]).length,0,
 'same UTC date prefixes must not falsely match after Vietnam midnight');
assert.equal(lookup(beforeMidnight,[{...receipt,sent_at:'2026-11-02T16:35:00Z'}]).length,1,
 'real uploads within 20 minutes remain review candidates');
assert.ok(source.includes('Có bill cần kiểm tra'));
assert.ok(source.includes('Chưa đối soát · Chưa ghi thu'));
assert.ok(source.includes('void showBill(candidate)'));
assert.ok(!source.includes('rpc(\'chat_bank_app_collect\''));
console.log('BANK-183 read-only reconciliation evidence candidates PASS');
