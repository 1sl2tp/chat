'use strict';
// UI-348 supersedes UI-336: one owned geometry for two-line customer cards.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const marker='/* UI-348: deterministic two-row customer cards';
const start=css.indexOf(marker);
const end=css.indexOf('/* UI-337: one typography scale',start);
assert(start>0&&end>start,'canonical two-line layout must precede typography');
const layout=css.slice(start,end);
function declaration(selector){
 const at=layout.indexOf(selector);
 assert(at>=0,'missing selector: '+selector);
 const open=layout.indexOf('{',at),close=layout.indexOf('}',open);
 return layout.slice(open+1,close);
}
const row=declaration('tr.bank-report-table-item{');
const name=declaration('tr.bank-report-table-item > td:first-child{');
const amount=declaration('tr.bank-report-table-item > td:nth-child(6){');
const count=declaration('tr.bank-report-table-item > td:nth-child(2){');
const status=declaration('tr.bank-report-table-item::after{');
assert.match(layout,/@media\(max-width:760px\)/);
assert.match(layout,/@media\(max-width:360px\)/);
assert.match(row,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
assert.match(row,/grid-template-rows:minmax\(24px,auto\) minmax\(18px,auto\)/);
assert.match(row,/align-items:center/);
assert.match(row,/row-gap:2px/);
assert.doesNotMatch(row,/align-items:baseline/);
for(const [part,area] of [[name,'1'],[amount,'1'],[count,'2'],[status,'2']]){
 assert(part.includes('grid-row:'+area+';'),'expected row '+area);
 assert.match(part,/align-self:center/);
}
assert.match(name,/grid-column:1\/9/);
assert.match(name,/text-overflow:ellipsis/);
assert.match(amount,/grid-column:9\/13/);
assert.match(amount,/width:100%/);
assert.match(amount,/text-align:right/);
assert.match(amount,/font-variant-numeric:tabular-nums/);
assert.match(count,/grid-column:1\/7/);
assert.match(status,/grid-column:7\/13/);
assert.match(status,/content:attr\(data-bank-collected-status\)/);
assert.match(status,/justify-self:end/);
assert.match(status,/line-height:18px/);
assert.match(count,/line-height:18px/);
assert.match(layout,/grid-row:3;/,'nonzero exceptional counters retain visibility');
assert.match(layout,/content:none!important/,'amount must not add a duplicate status line');
const render=js.slice(js.indexOf('function renderTable(data){'),
 js.indexOf('function vietnamBusinessDay(',js.indexOf('function renderTable(data){')));
assert(render.includes("const columns=['Khách hàng','Đã ghi thu','Bill chờ','Bill trùng','AI nghi ngày','Tiền đã thu']"));
assert(render.includes("tr.dataset.bankCollectedStatus=g.matched>0?'Đã ghi thu':'Chưa ghi thu'"));
assert(render.includes("for(const v of [g.name,g.matched,g.waiting,g.duplicate,g.old,bankDisplayVnd(g.money)])"));
assert(render.includes("tr.addEventListener('click',jump)"));
assert(!render.includes('g.money/1000'),'no change to financial calculation');
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
console.log('UI-348: two-line customer name/amount and count/status align; exceptional evidence survives PASS');
