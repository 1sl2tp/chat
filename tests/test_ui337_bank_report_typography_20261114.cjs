'use strict';
// UI-337: scoped presentation regression; no real money, messages or API calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const marker='/* UI-337: one typography scale for Admin bank reconciliation';
const start=css.indexOf(marker);
assert(start>0,'typography design token section exists');
const block=css.slice(start);
assert(block.startsWith(marker));
for(const rule of [
 '#bankReportDashboard.bank-report-dashboard{',
 '--bank-type-caption:12px;',
 '--bank-type-body:13px;',
 '--bank-type-control:13px;',
 '--bank-type-heading:19px;',
 '--bank-type-money:21px;',
 '#bankReportDashboard :is(button,input,select,textarea,summary){',
 'font-family:inherit;',
 '#bankReportDashboard .bank-report-heading{',
 '#bankReportDashboard .bank-report-controls > [data-bank-date]',
 '#bankReportDashboard .bank-report-controls > [data-bank-daily-summary]',
 '#bankReportDashboard .bank-report-controls > [data-bank-refresh]',
 '#bankReportDashboard.is-zero-day .bank-report-controls > [data-bank-date]',
 '#bankReportDashboard .bank-report-stat-name,',
 '#bankReportDashboard .bank-report-stat-number,',
 '#bankReportDashboard .bank-report-filters > .bank-report-filter,',
 '#bankReportDashboard .bank-report-empty-title,',
 '#bankReportDashboard .bank-report-empty-description,',
 '#bankReportDashboard .bank-report-empty-meta,',
 '#bankReportDashboard .bank-report-empty-previous,',
 '#bankReportDashboard .bank-report-table th{',
 '@media(max-width:760px){',
 '--bank-type-caption:11.5px;',
 '--bank-type-body:12.5px;',
 '--bank-type-control:12.5px;',
 '--bank-type-heading:18px;',
 '--bank-type-money:19px;',
 '@media(max-width:360px){',
 '--bank-type-caption:11px;',
 '--bank-type-body:12px;',
 '--bank-type-control:12px;',
 '--bank-type-heading:17px;',
 '--bank-type-money:18px;',
 'font-variant-numeric:tabular-nums;'
]){
 assert(block.includes(rule),'missing bank type contract '+rule);
}
assert(!/font-size:(?:9|10)(?:\.\d+)?px/.test(block),'new typography never shrinks captions to unreadable 9–10px');
assert(!/!important/.test(block),'scope and cascade must suffice without breaking other views');
assert(css.includes('grid-template-areas:"date date" "send refresh"'),'preserve approved mobile controls layout');
assert(css.includes('#bankReportDashboard .bank-report-detail-top > .bank-report-detail-amount'),
 'amount alignment preserved');
assert(js.includes("client.rpc('chat_bank_dashboard'"),'original report read preserved');
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"),'original guarded manual collection preserved');
assert(js.includes('bankExistingManualBillCandidates'),'manual bank review preserved');
console.log('UI-337: coherent bank reconciliation font family, sizes and existing finance/layout contracts PASS');
