'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','bank-report-dashboard.js'),'utf8');
const start=source.indexOf('function billHasSuspectSwappedDay(');
const end=source.indexOf('\nconst statusText=',start);
assert(start>=0&&end>start,'bank report suspected-date read-only owner must exist');
const flag=vm.runInNewContext(source.slice(start,end)+'\nbillHasSuspectSwappedDay;',{
 Date,Number,String,Math
});
const bill=(time,sent,status='amount_read')=>({
 bill_time:time,sent_at:sent,status,report_status:'waiting_bank',
 receipt_id:'test',ledger_id:null,notice_id:null,amount_vnd:91000
});
for(const [time,sent] of [
 ['2026-10-11 18:06:00','2026-11-10T11:06:39Z'],
 ['2026-10-11 17:42:38','2026-11-10T10:43:21Z'],
 ['2026-10-11 00:04','2026-11-09T17:05:00Z']
])assert.equal(flag(bill(time,sent)),true,'day/month swap must be shown as unverified '+time);
const sent='2026-11-10T11:06:39Z';
for(const row of [
 bill('2026-11-10 18:06',sent),
 bill('2026-10-11 10:25',sent),
 bill('2026-10-11 18:06',sent,'received'),
 {...bill('2026-10-11 18:06',sent),ledger_id:114},
 {...bill('2026-10-11 18:06',sent),notice_id:250},
 bill('2026-10-11',sent),
 bill('2026-13-11 18:06',sent),
 bill('',sent)
])assert.equal(flag(row),false,'do not turn verified/historical/invalid rows into false alerts');
assert.match(source,/dateSwapSuspect\?'AI nghi đọc nhầm ngày · Chưa thu'/);
assert.match(source,/dateSwapSuspect\?'Ngày AI đọc \(nghi nhầm\):/);
assert.match(source,/dateSwapSuspect\?'Ngày OCR nghi sai · Chờ đối chiếu ảnh và Agribank'/);
assert.match(source,/AI có thể đã đọc đảo ngày\/tháng so với ảnh bill/);
assert.doesNotMatch(source,/rpc\('chat_bank_app_collect'/,'report must not authorize bank money');
console.log('BANK-267: report marks suspected swapped bill dates without auto-collect or ledger writes PASS');
