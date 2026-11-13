'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const marker='/* UI-336: fix the CUSTOMER list\'s two-line alignment';
const at=css.indexOf(marker);
assert(at>0,'UI-336 must follow legacy customer list styles');
const layout=css.slice(at);
for(const token of [
 '@media(max-width:760px)',
 'tr.bank-report-table-item{',
 'grid-template-columns:repeat(12,minmax(0,1fr));',
 'grid-template-rows:min-content min-content;',
 'grid-auto-rows:min-content;',
 'grid-column:1/9;',
 'grid-row:1;',
 'grid-column:9/13;',
 'grid-row:2;',
 "td:nth-child(6)::after{",
 'content:none!important;',
 'tr.bank-report-table-item::after{',
 'content:"Đã ghi thu";',
 'align-self:baseline;',
 'font-variant-numeric:tabular-nums;',
 'grid-row:3;',
 '@media(max-width:360px)'
])assert(layout.includes(token),'missing final customer row alignment rule: '+token);
// Verify true peer positions, not just spacing of two independently flowing lines.
const pick=(selector)=> {
 const start=layout.indexOf(selector);
 assert(start>=0,'missing selector '+selector);
 const open=layout.indexOf('{',start),close=layout.indexOf('}',open);
 return layout.slice(open+1,close);
};
const name=pick('tr.bank-report-table-item > td:first-child');
const money=pick('tr.bank-report-table-item > td:nth-child(6)');
const count=pick('tr.bank-report-table-item > td:nth-child(2)');
const status=pick('tr.bank-report-table-item::after');
assert.match(name,/grid-row:1;/);
assert.match(money,/grid-row:1;/);
assert.match(count,/grid-row:2;/);
assert.match(status,/grid-row:2;/);
assert.match(name,/grid-column:1\/9;/);
assert.match(money,/grid-column:9\/13;/);
assert.match(count,/grid-column:1\/5;/);
assert.match(status,/grid-column:9\/13;/);
assert.match(count,/align-self:baseline;/);
assert.match(status,/align-self:baseline;/);
assert.match(money,/justify-self:end;/);
assert.match(status,/justify-self:end;/);
const render=js.slice(js.indexOf('function renderTable(data){'),js.indexOf('function vietnamBusinessDay(',js.indexOf('function renderTable(data){')));
assert(render.includes("const columns=['Khách hàng','Đã ghi thu','Bill chờ','Bill trùng','AI nghi ngày','Tiền đã thu']"));
assert(render.includes("for(const v of [g.name,g.matched,g.waiting,g.duplicate,g.old,bankDisplayVnd(g.money)])"));
assert(render.includes('if(i>=1&&i<=4)td.dataset.zero=String(Number(td.textContent)===0)'));
assert(render.includes("tr.addEventListener('click',jump)"),'row selection remains enabled');
assert(!render.includes('g.money/1000'),'no new finance rounding');
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
console.log('UI-336: customer name/money top row, count/collected-status same baseline, extras on row 3 PASS');
