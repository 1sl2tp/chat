'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const marker='/* UI-329: compact iPhone empty reconciliation state.';
const at=css.indexOf(marker);
assert(at>0,'the mobile empty-state style must exist');
const nextSection=css.indexOf('/* UI-330',at+1);
const scoped=css.slice(at,nextSection>at?nextSection:undefined);
assert(scoped.startsWith(marker));
const rules=[
 '#bankReportDashboard.is-zero-day .bank-report-header',
 '#bankReportDashboard.is-zero-day .bank-report-controls > [data-bank-date]',
 '#bankReportDashboard.is-zero-day .bank-report-empty-state',
 '#bankReportDashboard.is-zero-day .bank-report-empty-copy',
 '#bankReportDashboard.is-zero-day .bank-report-empty-title',
 '#bankReportDashboard.is-zero-day .bank-report-empty-description',
 '#bankReportDashboard.is-zero-day .bank-report-empty-meta',
 '#bankReportDashboard.is-zero-day .bank-report-empty-previous',
 '@media(max-width:360px)',
 ':focus-visible'
];
for(const rule of rules)assert(scoped.includes(rule),'missing mobile rule '+rule);
assert(scoped.includes('padding:13px 14px 14px'));
assert(scoped.includes('min-height:36px'));
assert(scoped.includes('max-width:44ch'));
assert(!scoped.includes('display:none'),'do not hide date picker, send, refresh or previous day');
assert(!scoped.includes('.bank-report-kpi-grid'),'non-zero day KPIs should be unchanged');
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(js.includes("el('button','bank-report-empty-previous','Xem ngày trước')"));
assert(html.includes('data-bank-date')&&html.includes('data-bank-daily-summary')&&html.includes('data-bank-refresh'));
console.log('UI-329: compact empty mobile card, preserved accessible controls and finance scope PASS');
