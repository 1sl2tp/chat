'use strict';
// UX-215: isolate the production parser without browser/network/ledger mutations.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','admin-composer-actions.js'),'utf8');
const start=source.indexOf('function cashThousandsToVnd(');
const end=source.indexOf('async function openQuickCash(',start);
assert(start>=0&&end>start,'production parser must be accessible');
const parserBlock=source.slice(start,end);
const convert=vm.runInNewContext(parserBlock+'\ncashThousandsToVnd;',{}, {timeout:1000});
for(const [input,expected] of [
 ['500',500000],['1',1000],['25',25000],['0',null],
 ['500.000',null],['500,000',null],['500đ',null],['50 0',null],
 ['000500',500000],['999999999',999999999000],['1000000000',null],
 ['-500',null],['',null],
])assert.equal(convert(input),expected,JSON.stringify(input));
assert(source.includes("client.rpc('v21_admin_debt_share_summary'"));
assert(source.includes("Number(data.balance)"));
assert(source.includes("const exactVnd=thousands*1000"));
assert(source.includes("p_amount_vnd:vnd"));
assert(source.includes("Number(data.source_amount_vnd)!==vnd"),
 'RPC responds with source_amount_vnd in dong; amount_vnd is thousands');
assert(source.includes("if(latestDebtVnd!==debtVnd)"));
assert(source.includes("check.checked=false"));
assert(source.includes("if(vnd===null)"));
assert(source.includes("after.textContent=balanceAfter>0?"));
console.log('UX-215 debt cash thousands -> VND, stale balance & RPC ack PASS');
