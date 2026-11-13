'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const begin=js.indexOf('function renderTable(data){');
const end=js.indexOf('// BANK-183-VN-DAY',begin);
assert(begin>0&&end>begin,'find live bank render-table source');
const node=(tag,cls='',value='')=>({
 tag,className:cls,textContent:String(value),children:[],dataset:{},tabIndex:-1,
 appendChild(child){this.children.push(child);return child;},
 replaceChildren(...children){this.children=children},
 setAttribute(){},addEventListener(){},
 classList:{
  classes:new Set(),
  add(x){this.classes.add(x)},
  remove(x){this.classes.delete(x)}
 }
});
const ui={table:node('div','bank-report-table-wrap'),date:{value:'2026-11-13'}};
const context={ui,selectedCustomer:null,root:{},
 el:node,append:(parent,...children)=>{for(const c of children)parent.appendChild(c);return parent},
 bankResponsiveLabel:x=>node('span','',x),bankMoneySpoken:x=>String(x),
 bankDisplayVnd:x=>String(x/1000),filter:'all',paint(){},Number,String,Map,Array};
const render=vm.runInNewContext(js.slice(begin,end)+'\nrenderTable',context);
render({bills:[]});
assert.equal(ui.table.children.length,1);
assert.equal(ui.table.children[0].tag,'div','empty state is NOT a table row');
assert.equal(ui.table.children[0].className,'bank-report-empty-state');
assert.equal(ui.table.children[0].children[0].children[0].textContent,
 'Chưa có bill trong ngày đã chọn');
assert.equal(ui.table.children[0].children[1].textContent,'Xem ngày trước');
assert(ui.table.classList.classes.has('is-empty'));
render({bills:[{customer_id:'a',customer_name:'Khách thử',report_status:'matched',amount_vnd:1000}]});
assert.equal(ui.table.children[0].tag,'table','non-empty preserves semantic six-column table');
assert(!ui.table.classList.classes.has('is-empty'));
assert(css.includes('#bankReportDashboard .bank-report-table-wrap.is-empty'));
assert(css.includes('#bankReportDashboard .bank-report-empty-state'));
assert(css.includes('@media(max-width:760px)'));
assert(css.includes('overflow-x:auto'));
assert(css.includes('.bank-report-filter-more[open] > .bank-report-filter-more-menu'));
assert(css.includes('position:static'),'Khác options must remain visible in swipe rail');
assert(css.includes('scroll-snap-type:x proximity'));
assert(html.includes('data-bank-date')&&html.includes('data-bank-daily-summary')&&html.includes('data-bank-refresh'));
assert(!js.includes("el('td','','Không có bill trong ngày')"));
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
console.log('UI-323: empty state semantic card, non-empty data table, swipeable filters and original actions PASS');
