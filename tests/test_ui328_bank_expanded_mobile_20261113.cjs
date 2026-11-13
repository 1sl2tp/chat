'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const section=css.slice(css.indexOf('/* UI-328: expanded Agribank rows on iPhone.'));
assert(section.startsWith('/* UI-328'));
for(const selector of [
 '@media(max-width:760px)',
 '.bank-report-detail[open] > .bank-report-detail-top',
 '.bank-report-detail-content.bank-report-detail-essential',
 '.bank-report-field-label',
 '.bank-report-field-value',
 '.bank-report-detail-actions .bank-report-action',
 '.bank-report-audit > summary',
 '.bank-report-audit-body',
 ':focus-visible',
 '@media(max-width:360px)'
])assert(section.includes(selector),'missing responsive style '+selector);
assert(section.includes('min-height:40px'),
 'expanded detail buttons and audit summary retain reasonable tap areas');
assert(section.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
assert(section.includes('overflow-wrap:anywhere'));
assert(js.includes('function bankCreditLine('));
assert(js.includes("el('details','bank-report-detail bank-report-credit')"));
assert(js.includes("el('summary','bank-report-detail-top')"));
assert(js.includes("el('details','bank-report-audit')"));
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(html.includes('data-bank-table')&&html.includes('data-bank-groups'));
assert(!html.includes('data-bank-variance'),'no unrelated finance variance widget');
assert(!js.includes('if(ui.variance)'),'finance calculation remains untouched');
console.log('UI-328 expanded bank details mobile CSS + unchanged bank actions PASS');
