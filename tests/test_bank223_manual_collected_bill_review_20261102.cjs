'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const first=source.indexOf('function vietnamBusinessDay(');
const last=source.indexOf('function detailLine(',first);
assert(first>=0&&last>first,'pure bank evidence helper');
const ctx=vm.createContext({Date,Number,String});
vm.runInContext(source.slice(first,last),ctx);
const match=ctx.matchingManualCollectionForBill;
const bill={receipt_id:'sam-bill',customer_id:'sam',status:'amount_read',
 amount_vnd:975000,receiving_account:'290118199999',
 sent_at:'2026-11-02T07:47:16Z',notice_id:null,ledger_id:null};
const credit={notice_id:'180',customer_id:'sam',amount_vnd:975000,
 transfer_at:'2026-11-02T07:47:00Z',collection_kind:'manual_collected',ledger_id:'661'};
const state={bills:[bill],bank_credits:[credit]};
assert.equal(match(bill,state)?.ledger_id,'661','C Sam PL manual credit stays visible, bill remains unlinked');
for(const bad of [
 {...credit,collection_kind:'unmatched'}, {...credit,collection_kind:'auto_collected'},
 {...credit,customer_id:'other'}, {...credit,amount_vnd:975001},
 {...credit,transfer_at:'2026-11-01T07:47:00Z'}, {...credit,ledger_id:null}
])assert.equal(match(bill,{...state,bank_credits:[bad]}),null,'unverified bank money cannot be presented as manual proof');
assert.equal(match(bill,{...state,bank_credits:[credit,{...credit,notice_id:'181'}]}),null,
 'two same-amount bank credits require manual review');
assert.equal(match(bill,{...state,bills:[bill,{...bill,receipt_id:'another'}]}),null,
 'two competing images cannot be treated as linked');
for(const bad of [
 {...bill,customer_id:'other'}, {...bill,receiving_account:'0000012345'},
 {...bill,status:'received'}, {...bill,notice_id:'180'}, {...bill,ledger_id:'661'},
 {...bill,sent_at:'2026-11-01T07:47:16Z'}
])assert.equal(match(bad,state),null,'conflicting or already linked bills never get manual hint');
const midnight={...bill,sent_at:'2026-11-01T18:00:00Z'};
const bankMidnight={...credit,transfer_at:'2026-11-01T17:30:00Z'};
assert.equal(match(midnight,{bills:[midnight],bank_credits:[bankMidnight]})?.notice_id,'180',
 'VN date boundary not UTC date prefix');
for(const token of [
 'Có thu tay · Chờ xác minh bill','bill cùng khách và số tiền chưa liên kết',
 'Không thu tiền lần hai.','Xem bill chờ xác minh',
 "cardValue('Bill chưa đối soát'","['Khách hàng','Đã ghi thu','Bill chờ','Bill trùng','AI nghi ngày','Tiền đã thu']"
])assert(source.includes(token),token);
assert(!source.includes("rpc('chat_bank_app_collect'"),'no client auto money write');
console.log('BANK-223: manual paid versus unlinked bill report, fail-closed review PASS');
