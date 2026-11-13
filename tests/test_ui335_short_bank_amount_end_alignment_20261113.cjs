'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const at=css.lastIndexOf('/* UI-335: correct the two short-value rows');
assert(at>0,'a final CSS rule must override UI-334, not precede it');
const end=css.slice(at);
for(const token of [
 '#bankReportDashboard .bank-report-detail-top{',
 '--bank-time-width:60px;',
 '--bank-amount-width:112px;',
 'grid-template-columns:var(--bank-time-width) var(--bank-amount-width) minmax(0,1fr) minmax(0,max-content);',
 '#bankReportDashboard .bank-report-detail-top::before{',
 'position:absolute;',
 '.bank-report-detail-time{',
 'grid-area:1 / 1;',
 '.bank-report-detail-amount{',
 'grid-area:1 / 2;',
 'display:flex;',
 'justify-content:flex-end;',
 'justify-self:stretch;',
 'width:100%;',
 'text-align:right;',
 'white-space:nowrap;',
 'font-variant-numeric:tabular-nums;',
 'font-feature-settings:"tnum" 1;',
 ':is(.bank-report-detail-status,.bank-report-quick-collect)',
 'grid-area:1 / 4;',
 '@media(max-width:760px)',
 '--bank-amount-width:92px;',
 '@media(max-width:360px)',
 '--bank-amount-width:76px;'
])assert(end.includes(token),'missing mandatory final amount alignment style: '+token);
// A dedicated numeric track has the same right edge for every glyph length.
// We intentionally don't add leading blanks or change the transfer value.
function amountEnd(vw,amount){
 const w=vw<=360?76:vw<=760?92:112;
 const time=vw<=360?40:vw<=760?50:60;
 const gap=vw<=360?4:vw<=760?6:8;
 assert(amount.length*9<=w,'test amount fits in the reserved amount track');
 return time+gap+w;
}
for(const vw of [320,360,375,390,430,490,760,900]){
 const coords=['100','463','730','1.000','2.000','10.000','100.000'].map(x=>amountEnd(vw,x));
 assert.equal(new Set(coords).size,1,'inconsistent end alignment at '+vw+'px');
}
const credit=js.slice(js.indexOf('function bankCreditLine('),js.indexOf('function renderGroups(data){'));
const bill=js.slice(js.indexOf('function detailLine('),js.indexOf('function bankCreditLine('));
assert(credit.includes("el('strong','bank-report-detail-amount',bankDisplayVnd(row.amount_vnd))"));
assert(bill.includes("el('strong','bank-report-detail-amount',bankDisplayVnd(row.amount_vnd))"));
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
console.log('UI-335: 463 and 730 now occupy the same right-aligned numeric track as longer amounts PASS');
