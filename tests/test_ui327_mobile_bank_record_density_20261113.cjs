'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const start=css.indexOf('/* UI-327: refined mobile report records');
assert(start>0,'mobile record refinement must exist');
const section=css.slice(start);
for(const rule of [
 '@media(max-width:760px)',
 '.bank-report-kpi-grid .bank-report-stat[data-metric-kind="money"]',
 '.bank-report-kpi-grid .bank-report-stat[data-metric-kind="count"]',
 '.bank-report-table tbody tr.bank-report-table-item',
 '.bank-report-table tbody tr.bank-report-table-item > td:first-child',
 '.bank-report-table tbody tr.bank-report-table-item > td:nth-child(6)',
 '.bank-report-customer-head',
 '.bank-report-customer-count',
 '.bank-report-detail-top',
 '.bank-report-detail-time',
 '.bank-report-detail-amount',
 '.bank-report-detail-status:not(button)',
 '.bank-report-detail[open] > .bank-report-detail-top',
 ':focus-visible',
 '@media(max-width:360px)'
])assert(section.includes(rule),'missing mobile style rule: '+rule);
assert(section.includes('min-height:53px'),'customer row must be compact');
assert(section.includes('min-height:43px'),'bank transaction row must be compact');
assert(section.includes('grid-template-columns:50px minmax(0,1fr) minmax(80px,max-content)'),
 'time, amount and status must have independent responsive tracks');
assert(!html.includes('data-bank-variance'),
 'unrequested computed finance variance callout must stay removed');
assert(!js.includes('if(ui.variance)'));
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(html.includes('data-bank-date')&&html.includes('data-bank-refresh'));
assert(html.includes('data-bank-filters')&&html.includes('data-bank-table'));
console.log('UI-327 responsive record density and finance scope guard PASS');
