'use strict';
// UX-217: cash dialog uses exact Agribank /1000 display and NO currency suffix.
// This tests the production helpers, rather than an independently reimplemented copy.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','admin-composer-actions.js'),'utf8');
const begin=src.indexOf('function cashThousandsToVnd(');
const end=src.indexOf('async function openQuickCash(',begin);
assert(begin>=0&&end>begin,'cash money helpers are present');
const tools=vm.runInNewContext(src.slice(begin,end)+'\n({cashThousandsToVnd,cashFormatThousands});',{Intl,Number,String});
assert.equal(tools.cashThousandsToVnd('500'),500000);
assert.equal(tools.cashThousandsToVnd('49'),49000);
assert.equal(tools.cashThousandsToVnd('250'),250000);
assert.equal(tools.cashThousandsToVnd('332'),332000);
assert.equal(tools.cashThousandsToVnd('500.000'),null,'ambiguous formatted dong must not become a huge receipt');
assert.equal(tools.cashThousandsToVnd('500đ'),null,'currency suffix is not accepted in amount input');
assert.equal(tools.cashFormatThousands(49000),'49');
assert.equal(tools.cashFormatThousands(500000),'500');
assert.equal(tools.cashFormatThousands(2150000),'2.150');
assert.equal(tools.cashFormatThousands(1650000),'1.650');
assert.equal(tools.cashFormatThousands(2150050),'2.150,05','keep sub-thousand values exact');
assert.equal(tools.cashFormatThousands(-100000),'-100');
const modal=src.slice(end,src.indexOf('function mountQuickActions(',end));
for(const token of [
 'Dư nợ hiện tại (÷1.000)','Số tiền thu (÷1.000)',
 'Giống Agribank: 500.000 ÷ 1.000 = 500',
 "cashFormatThousands(debtVnd)","cashFormatThousands(vnd)",
 "cashFormatThousands(balanceAfter)",
 "Number(data.source_amount_vnd)!==vnd",
 "p_amount_vnd:vnd","if(latestDebtVnd!==debtVnd)",
 "client.rpc('chat_admin_quick_cash_balance'",
]) assert(modal.includes(token),'missing '+token);
assert(!modal.includes('cashFormatVnd('));
assert(!modal.includes('500.000đ'));
assert(!modal.includes('0đ'));
assert(!modal.includes("+'đ'"));
console.log('UX-217: cash input, balance, preview, confirmed collection all /1000; no currency suffix PASS');
