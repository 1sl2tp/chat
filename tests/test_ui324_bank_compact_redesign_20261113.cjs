'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.source.html','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const start=html.indexOf('<section id="bankReportDashboard"');
const stop=html.indexOf('id="conversationContentAxis"',start);
const report=html.slice(start,stop);
assert(start>0&&stop>start);
const caption=report.indexOf('Giao dịch & bill');
const filters=report.indexOf('data-bank-filters');
const table=report.indexOf('data-bank-table');
assert(caption>0&&caption<filters&&filters<table,
 'filters must precede results and empty state, no clipped overflow after them');
assert(report.includes('data-bank-date')&&report.includes('data-bank-refresh'));
assert(report.includes('data-bank-daily-summary'),
 'sending control remains explicit, never automatic');
const own=css.slice(css.indexOf('/* UI-324: compact decision-first bank report'));
assert(own.length>6000);
assert(own.includes('grid-template-columns:repeat(4,minmax(0,1fr))'));
assert(own.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
assert(own.includes('.bank-report-stat[data-metric-kind="money"]'));
assert(own.includes('min-height:64px!important'));
assert(own.includes('.bank-report-stat[data-metric-kind="count"]'));
assert(own.includes('min-height:42px!important'));
assert(own.includes('.bank-report-empty-previous'));
assert(own.includes('overflow:visible'));
assert(own.includes('.bank-report-filter-more[open] > .bank-report-filter-more-menu'));
assert(own.includes('position:absolute'));
assert(own.includes('max-height:min(54dvh,390px)'));
assert(own.includes('@media(max-width:360px)'));
assert(js.includes("const mainKeys=new Set(['all','waiting_bank','matched']);"));
assert(js.includes("waiting_bank:'Chờ khớp'"));
assert(js.includes("matched:'Đã khớp'"));
assert(js.includes("const secondary=filters.filter(([key])=>!mainKeys.has(key));"));
assert(js.includes("const currentDay=String(ui.date.value||'');"));
assert(js.includes("selected.setUTCDate(selected.getUTCDate()-1);"));
assert(js.includes("if(previous>='2026-10-19')"));
assert(js.includes('selectedCustomer=null;detailPanelOpen=false;current=null;'),
 'day navigation resets customer and expanded detail together');
assert(js.includes('void reload();'));
assert(!own.includes('display:none!important;}'));
// Finance and receipt authorization ownership must not migrate to styling.
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(report.includes('Số tiền ÷ 1.000 · Giờ VN 24h'));
console.log('UI-324: visible mobile redesign, all filters accessible, data untouched PASS');
