'use strict';
// BANK-312: report arithmetic is VND ÷ 1000 for presentation only.
// Money posted to the ledger remains in the existing exact-VND input flow.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.source.html','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const start=html.indexOf('<section id="bankReportDashboard"');
const end=html.indexOf('id="conversationContentAxis"',start);
const report=html.slice(start,end);
assert(start>0&&end>start);
assert.equal((report.match(/Số tiền ÷ 1\.000 · Giờ VN 24h/g)||[]).length,1,
 'thousands scale and Vietnam 24h timezone must appear exactly once');
assert(!report.includes('VND · Giờ Việt Nam'),'do not switch the report back to full VND');
assert(!report.includes('Đơn vị: 1.000đ'),'no currency suffix next to the scale');
assert(report.includes('Gửi đối soát</button>'),'short bank summary action stays on same row');
assert(report.includes('data-bank-date')&&report.includes('data-bank-refresh'));
assert(report.includes('data-bank-summary')&&report.includes('data-bank-status'));
assert(report.indexOf('data-bank-summary')<report.indexOf('data-bank-status'));

const moneyBegin=js.indexOf('function bankMoneyThousands(');
const moneyEnd=js.indexOf('const localDate=',moneyBegin);
assert(moneyBegin>0&&moneyEnd>moneyBegin);
const api=vm.runInNewContext(js.slice(moneyBegin,moneyEnd)+
 '\n({bankMoneyThousands,bankDisplayVnd,bankManualBookedPreview})',
 {Number,Math,Intl,String});
for(const [v,display] of [
 [0,'0'],
 [26446000,'26.446'],
 [25716000,'25.716'],
 [15000000,'15.000'],
 [10716000,'10.716'],
 [10000000,'10.000'],
 [8000000,'8.000'],
 [5075000,'5.075'],
 [3156000,'3.156'],
 [2022000,'2.022'],
 [730000,'730'],
 [463000,'463'],
 [0,'0'],
 [16000008,'16.000 (lẻ 8)'],
 [570050,'570 (lẻ 50)'],
 [999,'0 (lẻ 999)'],
 [-2022000,'-2.022'],
 [null,'—'],
 [undefined,'—'],
 [Infinity,'—']
]){
 assert.equal(api.bankMoneyThousands(v),display,'core thousands '+String(v));
 assert.equal(api.bankDisplayVnd(v),display,'shared bank UI format '+String(v));
 assert(!display.includes('đ')&&!display.includes('₫'),'no currency suffix');
}
assert.equal(api.bankManualBookedPreview(16000008).bookedVnd,16000000,
 'input precision and debit booking must stay unchanged');
assert.equal(api.bankManualBookedPreview(16000008).ignoredVnd,8,
 'sub-thousand value remains traceable');
assert(js.includes("const money=bankMoneyThousands;"));
assert(js.includes("const bankDisplayVnd=x=>bankMoneyThousands(x);"),
 'all display branches must use identical thousand units');
assert(js.includes("cardValue('Tổng tiền vào Agribank',bankDisplayVnd(incomingAmountVnd)"));
assert(js.includes("cardValue('Đã thu có chứng từ',bankDisplayVnd(s.matched_amount)"));
assert(js.includes("bankDisplayVnd(g.money)"));
assert(js.includes("bankDisplayVnd(row.amount_vnd)"));
assert(js.includes("bankDisplayVnd(accounting.bookedVnd)"));
assert(!js.includes("bankManualVnd(n)+'đ'"),'do not append dong suffix behind scaled amount');

// Balanced action tracks: three peers for the toolbar, six equal filter
// buttons on desktop, three columns/two rows on a narrow phone.
// Work actions follow the number of pending types, without half-width or
// detached last-row buttons.
const block=css.slice(css.indexOf('/* BANK-312:'));
assert(block.length>3000,'final style owner must override old ad-hoc flex layout');
assert(block.includes('grid-template-columns:minmax(0,1.15fr) minmax(0,1.25fr) minmax(0,.8fr)'));
assert(block.includes('#bankReportDashboard .bank-report-controls > input'));
assert(block.includes('grid-template-columns:repeat(6,minmax(0,1fr))'));
assert(block.includes('@media(max-width:760px)'));
assert(block.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
assert(block.includes('grid-template-columns:repeat(var(--bank-task-columns,3),minmax(0,1fr))'));
assert(js.includes("actions.style.setProperty('--bank-task-columns',String(waiting.length));"),
 'task count and layout column count must stay in sync');
assert(block.includes('width:100%;max-width:100%;min-width:0;box-sizing:border-box'));
assert(block.includes('min-height:39px'));
assert(block.includes('min-height:37px'),'touch targets must stay usable');
assert(block.includes('font-variant-numeric:tabular-nums'),'figures are aligned');
assert(block.includes('.bank-report-table tbody tr.bank-report-table-item'),
 'customer row spacing was audited');
const allEmpty=js.indexOf("if(filter==='all'&&!selectedCustomer&&!banks.length&&!pendingBills.length)");
assert(allEmpty>0&&js.slice(allEmpty,allEmpty+300).includes('return;'),
 'no redundant empty detail hint when the customer table already has an empty state');
assert(!js.slice(allEmpty,allEmpty+260).includes('Chạm một khách hàng'),'no empty duplicate instructions');

// This change is formatting only: no changes to posted ledger or RPC paths.
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
console.log('BANK-312: /1000 no suffix, exact remainder, 3×2 mobile filters, 6 desktop filters, balanced controls PASS');
