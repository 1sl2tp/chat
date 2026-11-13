'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const anchor=js.indexOf('const summaryHasData=Object.values(s).some(value=>');
const end=js.indexOf('if(ui.queue){',anchor);
assert(anchor>0&&end>anchor,'UI-325 has a standalone detection guard');
const evaluate=new Function('s','incoming','data','root',js.slice(anchor,end)+'\nreturn zeroDay;');
function check(summary,credits=[],bills=[],manual=[]){
 let state=null;
 const root={classList:{toggle(key,value){assert.equal(key,'is-zero-day');state=value;}}};
 const zero=evaluate(summary,credits,{bills,manual_collections:manual},root);
 assert.equal(state,zero,'zero data must be mirrored on root CSS state');
 return zero;
}
assert.equal(check({matched_count:0,matched_amount:0,bill_only_count:0}),true);
assert.equal(check({matched_count:0},[{amount_vnd:730000}]),false,
 'bank credit must never be hidden as no-data');
assert.equal(check({matched_count:0},[],[{id:'b'}]),false,
 'unmatched bill must remain visible');
assert.equal(check({matched_count:1}),false,'verified collection cannot be hidden');
assert.equal(check({matched_amount:300000}),false,'nonzero financial amount must show');
assert.equal(check({matched_count:0},[],[],[{id:'m'}]),false,
 'manual collection must remain visible');
assert(js.includes('Không đồng nghĩa ngân hàng không có tiền về.'));
assert(js.includes('Báo cáo hôm nay: 0 tiền vào · 0 đã thu · 0 bill'));
assert(js.includes("root.classList.contains('is-zero-day')"));
const css325=css.slice(css.indexOf('/* UI-325: real no-data mode'));
assert(css325.length>2900);
for(const token of [
 'grid-template-areas:"date date" "send refresh"',
 '.bank-report-controls > [data-bank-date]',
 '.bank-report-controls > [data-bank-daily-summary]',
 '.bank-report-controls > [data-bank-refresh]',
 '.is-zero-day .bank-report-kpi-grid',
 '.is-zero-day .bank-report-extra-metrics',
 '.is-zero-day .bank-report-table-caption',
 '.is-zero-day .bank-report-filters',
 '.is-zero-day .bank-report-empty-meta',
 '.is-zero-day .bank-report-empty-previous'
])assert(css325.includes(token),'missing responsive rule: '+token);
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
console.log('UI-325: collapsed zero-data view, bank uncertainty, available credit and ledger controls PASS');
