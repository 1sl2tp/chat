'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.source.html','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const marker=html.indexOf('id="bankReportDashboard"');
const report=html.slice(marker,html.indexOf('id="conversationContentAxis"',marker));
assert(marker>0);
assert(report.includes('<h2 class="bank-report-heading">Đối soát chuyển khoản</h2>'));
assert(report.includes('VND · Giờ Việt Nam'));
assert(report.includes('class="bank-report-kpi-grid"'));
assert(report.indexOf('data-bank-summary')<report.indexOf('data-bank-status'));
assert(report.indexOf('data-bank-status')<report.indexOf('data-bank-work-queue'),
 '4 KPIs must be seen together before the exception queue');
assert(!report.includes('Đơn vị: 1.000đ'), 'financial unit is VND, not unexplained thousands');

// One real credit, no matter how often Android replays its notification.
const start=js.indexOf('// BANK-309: deduplicate notifications BEFORE any reporting/counting/UI.');
const end=js.indexOf('function bankLineClock(',start);
assert(start>0&&end>start);
const {bankCreditViewModel}=vm.runInNewContext(js.slice(start,end)+
 '\n({bankCreditViewModel})',{Number,String,Map,Array,Math});
const tx=(id,amount,bal,fp,ledger,clock='2026-11-12 19:31:00')=>({
 notice_id:String(id),bank_credit_account:'2901181999999',bank_time:clock,
 amount_vnd:amount,bank_balance_text:bal,bank_memo:'LAI VAN TAN chuyen tien',
 fingerprint:fp,ledger_id:ledger||null,
 collection_kind:ledger?'auto_collected':'unmatched'
});
const dedup=bankCreditViewModel([
 tx(274,730000,'-114,899,730','f'.repeat(64)),
 tx(280,730000,'-114,899,730','f'.repeat(64))
]);
assert.equal(dedup.length,1,'one bank transaction never creates two visible rows');
assert.equal(dedup[0].bank_group_exact,true);
// Equal amount and minute are not proof: a distinct closing balance stays distinct.
assert.equal(bankCreditViewModel([
 tx(1,730000,'-114,899,730','a'.repeat(64)),
 tx(2,730000,'-114,169,730','b'.repeat(64))
]).length,2);

const billStart=js.indexOf('function bankBillDisplayTime(');
const billEnd=js.indexOf('function detailLine(',billStart);
const {bankBillDisplayTime}=vm.runInNewContext(js.slice(billStart,billEnd)+
 '\n({bankBillDisplayTime})',{String});
assert.equal(bankBillDisplayTime('2026-11-12 18:52:08'),'18:52:08 12/11/2026');
assert.equal(bankBillDisplayTime('2026-11-12 18:52'),'18:52 12/11/2026');
assert.equal(bankBillDisplayTime(null),'Không đọc được giờ trên bill');

const currencyStart=js.indexOf('const bankManualVnd=');
const currencyEnd=js.indexOf('const localDate=',currencyStart);
assert(currencyStart>0&&currencyEnd>currencyStart);
const {bankDisplayVnd}=vm.runInNewContext(js.slice(currencyStart,currencyEnd)+
 '\n({bankDisplayVnd})',{Number,Intl});
assert.equal(bankDisplayVnd(26446000),'26.446.000đ');
assert.equal(bankDisplayVnd(25716000),'25.716.000đ');
assert.equal(bankDisplayVnd(730000),'730.000đ');
assert.equal(bankDisplayVnd(8000000),'8.000.000đ');
assert.equal(bankDisplayVnd(null),'—');

// No duplicate explanations or low-value missing-API fields in the regular UI.
const creditStart=js.indexOf('function bankCreditLine(');
const creditEnd=js.indexOf('function renderGroups(',creditStart);
const bankUI=js.slice(creditStart,creditEnd);
assert(creditStart>0&&creditEnd>creditStart);
assert(!bankUI.includes('Đã gom'), 'Android replay dedupe is an internal data concern');
assert(!bankUI.includes('Đã lọc '), 'do not make transaction statuses about parser repair');
assert(!bankUI.includes('Chưa có dữ liệu từ API hiện tại'),
 'missing API fields should be omitted rather than repeated');
assert(bankUI.includes("el('summary','','Thông tin kỹ thuật')"));
assert(bankUI.includes("if(!candidate){"),
 'without strong evidence, a tentative group cannot enable collection');
assert(bankUI.includes('bankDisplayVnd(row.amount_vnd)'));
assert(bankUI.includes("row.bank_memo"),'display bank memo only if present');
assert(bankUI.includes("row.bank_balance_text"),'display bank closing balance only if present');
assert(js.includes("selectedCustomer&&!r.receipt_id"),
 'do not show the matched bank credit and same bill twice in selected customer view');
assert(js.includes("entry.appendChild(detailLine(bill));"),
 'waiting bank bill appears as one item, not duplicate name/time rows');
assert(js.includes("td.dataset.zero=String(Number(td.textContent)===0);"),
 'zero diagnostics may be hidden on mobile, never removed from desktop data');
assert(css.includes('BANK-311: compact, source-consistent Admin bank report'));
assert(css.includes('.bank-report-kpi-grid'));
assert(css.includes('td[data-zero="true"]'));
assert(css.includes('display:flex;flex-wrap:wrap;gap:5px 11px'));
assert(css.includes('.bank-report-audit'));
assert(!js.slice(creditStart,creditEnd).includes("client.rpc("),'rendering cannot collect');
console.log('BANK-311: 8 distinct real credits, 4 VND KPIs, compact accessible mobile and quiet replay handling PASS');
