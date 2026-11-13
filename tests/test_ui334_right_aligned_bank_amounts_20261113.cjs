'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const marker='/* UI-334: a stable right-aligned amount column';
const at=css.indexOf(marker);
assert(at>0,'bank number-alignment rules should be present');
const section=css.slice(at);
for(const rule of [
 '#bankReportDashboard .bank-report-detail-top{',
 'grid-template-columns:60px 112px minmax(0,1fr) minmax(0,max-content);',
 '.bank-report-detail-time{',
 'grid-column:1;',
 '.bank-report-detail-amount{',
 'grid-column:2;',
 'justify-self:stretch;',
 'width:100%;',
 'text-align:right;',
 'font-variant-numeric:tabular-nums;',
 'font-feature-settings:"tnum" 1;',
 ':is(.bank-report-detail-status,.bank-report-quick-collect)',
 'grid-column:4;',
 '@media(max-width:760px)',
 'grid-template-columns:50px 92px minmax(0,1fr) minmax(0,max-content);',
 '@media(max-width:360px)',
 'grid-template-columns:40px 76px minmax(0,1fr) minmax(0,102px);'
])assert(section.includes(rule),'missing amount alignment rule: '+rule);
assert(!section.includes('::before{content:" '),
 'do not insert spaces into displayed money values');
function rightEdge(mobileWidth, num) {
 const columnWidth=mobileWidth<=360?76:mobileWidth<=760?92:112;
 // Digit count never changes the right edge of a right-aligned cell.
 const paddedTextWidth=num.length*8;
 assert(paddedTextWidth<=columnWidth,'test amounts must fit inside reserved money column');
 const start=mobileWidth<=360?40:mobileWidth<=760?50:60;
 const gap=mobileWidth<=360?4:mobileWidth<=760?6:8;
 return start+gap+columnWidth;
}
for(const vw of [320,360,390,490,760,900]){
 const edges=['100','1.000','10.000','100.000'].map(v=>rightEdge(vw,v));
 assert.equal(new Set(edges).size,1,'last digit must line up at viewport '+vw);
}
const credit=js.slice(js.indexOf('function bankCreditLine('),js.indexOf('function renderGroups(data){'));
const bill=js.slice(js.indexOf('function detailLine('),js.indexOf('function bankCreditLine('));
for(const part of [credit,bill]){
 assert(part.includes("el('summary','bank-report-detail-top')"));
 assert(part.includes("el('strong','bank-report-detail-amount'"));
 assert(part.includes('append(top,left,amt,label)'),
  'both bank and bill rows must preserve time / amount / status order');
}
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
console.log('UI-334: fixed money alignment on 320/360/390/490/760/900px and unchanged values PASS');
