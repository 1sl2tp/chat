'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const asset=fs.readFileSync('assets/bank-empty-reconcile.svg','utf8');
const marker='/* UI-330 — Approved Concept 2: balanced mobile card layout.';
const i=css.indexOf(marker);
assert(i>0,'approved mobile design must be present');
const approved=css.slice(i);
for(const rule of [
 '@media(max-width:760px)',
 '@media(max-width:360px)',
 '#bankReportDashboard .bank-report-controls,',
 '#bankReportDashboard.is-zero-day .bank-report-controls',
 'grid-template-columns:repeat(2,minmax(0,1fr))',
 'grid-template-areas:"date date" "send refresh"',
 'grid-area:send;',
 'grid-area:refresh;',
 'grid-area:date;',
 'column-gap:10px;',
 'min-height:46px;',
 'height:46px;',
 'border-radius:12px;',
 'background:#101214;',
 'border:1px solid #101214;',
 '#bankReportDashboard.is-zero-day .bank-report-empty-state::before',
 'url("./assets/bank-empty-reconcile.svg")',
 '#bankReportDashboard.is-zero-day .bank-report-empty-copy',
 '#bankReportDashboard.is-zero-day .bank-report-empty-meta',
 '#bankReportDashboard.is-zero-day .bank-report-empty-previous',
 ':focus-visible'
])assert(approved.includes(rule),'missing approved UI rule: '+rule);
assert(approved.includes('width:100%;')&&approved.includes('min-width:0;'),
 'each action must fully fill its equal width grid track');
assert(approved.includes('background:#eaf4ef;'),'approved meta chip uses muted mint');
assert(!approved.includes('.bank-report-status-main{display:none'),
 'hide money summary only via existing zero-data condition');
assert(asset.includes('<svg')&&asset.includes('viewBox="0 0 160 128"'));
assert(asset.includes('stroke="#32746C"'));
assert(!asset.includes('<script')&&!asset.includes('foreignObject'));
assert(js.includes('Trong dữ liệu ngày đã chọn, chưa có giao dịch cần đối soát.'));
assert(js.includes('Xem ngày trước'));
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(html.includes('data-bank-date')&&html.includes('data-bank-daily-summary')
 &&html.includes('data-bank-refresh'));
assert(html.includes('data-bank-table')&&html.includes('data-bank-groups'));
console.log('UI-330: approved centered empty card and exact 50/50 actions pass');
