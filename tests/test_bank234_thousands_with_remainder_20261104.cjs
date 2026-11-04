'use strict';
// BANK-234: Display thousands consistently but preserve every odd dong.
// Pure UI formatting: never change actual bank amount or ledger posting.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const start=source.indexOf('function bankMoneyThousands(');
const end=source.indexOf('// BANK-231:',start);
assert(start>=0&&end>start,'pure bank report formatter is present');
const money=vm.runInNewContext(source.slice(start,end)+'\nbankMoneyThousands;',{
 Number,Math,Intl
});
const cases=[
 [16_000_008,'16.000 (lẻ 8₫)'],
 [16_000_000,'16.000'],
 [10_000_000,'10.000'],
 [1_398_000,'1.398'],
 [45_991_008,'45.991 (lẻ 8₫)'],
 [570_050,'570 (lẻ 50₫)'],
 [1999,'1 (lẻ 999₫)'],
 [8,'0 (lẻ 8₫)'],
 [0,'0'],
 [-16_000_008,'-16.000 (lẻ 8₫)'],
 [null,'—'],['','—'],[Infinity,'—'],[1.5,'—']
];
for(const [actual,expected] of cases)
 assert.equal(money(actual),expected,'display '+String(actual));
assert.equal(source.includes('const money=bankMoneyThousands;'),true,
 'summary, rows and selected bank details use the same formatter');
assert(source.includes("const bookedVnd=Math.trunc(bankVnd/1000)*1000;"),
 'do not change manual ledger booking precision');
assert(source.includes("Number(data.amount_vnd)!==accounting.bankVnd"),
 'bank money proof remains exact');
console.log('BANK-234 display whole thousands plus visible exact dong remainder PASS');
