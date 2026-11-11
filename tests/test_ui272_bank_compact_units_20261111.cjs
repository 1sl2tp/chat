'use strict';
// UI-272: one monetary scale for this selected-day report, never repeated
// in the customer table or in the six main filters. No finance mutations.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const report=html.slice(html.indexOf('id="bankReportDashboard"'),
 html.indexOf('id="conversationContentAxis"'));
assert(report.length>0);
assert.equal((report.match(/Đơn vị: 1\.000đ/g)||[]).length,1,'show money unit exactly once');
assert(report.includes('class="bank-report-status-line"'));
assert(report.includes('data-bank-updated role="status" aria-live="polite"'));
assert(css.includes('min-height:76px;padding:10px 12px;'),
 'compact equal-size KPIs with 76px total height (box-sizing border-box)');
assert(css.includes('box-sizing:border-box;display:flex;flex-direction:column;'));
assert(css.includes('white-space:nowrap;')&&css.includes('content:attr(data-mobile-label)'),
 'mobile customer total stays a single label line');
assert(js.includes("td.dataset.mobileLabel=i===5?'Đã thu':shortColumns[i]"));
assert(js.includes("cell('Tiền vào Agribank',money(row.amount_vnd))"));
assert(js.includes("cardValue('Bill chưa đối soát'"));
assert(js.includes("cardValue('Đã thu có chứng từ'"));
assert(js.includes("'Tiền vào NH'"));
assert(!js.includes('Thu ngày chọn (nghìn'));
assert(!js.includes('Tiền vào NH (nghìn'));
assert(!js.includes("+' nghìn ₫'"));
assert(!js.includes("' (nghìn đồng)'"));
assert(!report.includes('(nghìn'),'no repeated monetary scale beside controls');

const start=js.indexOf('const bankFilterMobileLabels=');
const end=js.indexOf('function cardValue(',start);
assert(start>0&&end>start);
const ctx=vm.createContext({});
vm.runInContext(js.slice(start,end)+'\nglobalThis.labels=bankFilterMobileLabels;',ctx);
assert.equal(ctx.labels.waiting_bank,'Chờ đối soát');
assert.equal(ctx.labels.bank_only,'Chưa gắn bill');
assert.equal(ctx.labels.review,'Cần xác minh');
assert.notEqual(ctx.labels.waiting_bank,ctx.labels.bank_only,'cash and bill distinctions remain');
const filterStart=js.indexOf('const filters=[');
const filterEnd=js.indexOf('];',filterStart)+2;
const scope=vm.createContext({});
vm.runInContext(js.slice(filterStart,filterEnd)+'\nglobalThis.filtersView=filters;',scope);
const expected=['Tất cả','Đã khớp','Chờ đối soát','Chưa gắn bill','Cần xác minh'];
for(const name of expected)assert(scope.filtersView.some(x=>x[1]===name),name);
assert(js.includes('const money=bankMoneyThousands;'),'keep old amounts and rounding');
assert(js.includes("client.rpc('chat_bank_dashboard'"),'keep the existing read-only report source');
console.log('UI-272: compact four KPIs, one unit note, concise filters and customer labels PASS');
