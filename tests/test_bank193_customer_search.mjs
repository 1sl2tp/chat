import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../bank-report-dashboard.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../bank-report-dashboard.css',import.meta.url),'utf8');
const start=js.indexOf('function bankCustomerSearchKey(value){');
const end=js.indexOf('const money=x=>',start);
assert(start>=0&&end>start,'search helper functions must exist');
const {bankCustomerSearchKey,bankCustomerSearchMatches}=vm.runInNewContext(
 js.slice(start,end)+';({bankCustomerSearchKey,bankCustomerSearchMatches})'
);
const customers=[
 {id:'1',name:'C Sâm pl'}, {id:'2',name:'C Hương đv'},
 {id:'3',name:'Chị Huệ tt'}, {id:'4',name:'Bác Thơm Lê'},
 {id:'5',name:'C Sâm khác'}
];
assert.equal(bankCustomerSearchKey('SÂM'), 'sam');
assert.equal(bankCustomerSearchKey('Đặng'), 'dang');
assert.equal(bankCustomerSearchKey('  C  Sâm  PL  '),'c sam pl');
assert.equal(bankCustomerSearchMatches(customers,'sam pl')[0].id,'1');
assert.equal(bankCustomerSearchMatches(customers,'huong')[0].id,'2');
assert.equal(bankCustomerSearchMatches(customers,'thom')[0].id,'4');
assert.equal(bankCustomerSearchMatches(customers,'HUỆ')[0].id,'3');
assert.equal(bankCustomerSearchMatches(customers,'không có').length,0);
assert.equal(bankCustomerSearchMatches(customers,'sam').length,2);

for(const token of [
 "customerSearch.type='search'",
 "customerSearch.setAttribute('role','combobox')",
 "customerSearch.setAttribute('aria-controls',customerList.id)",
 "customerList.setAttribute('role','listbox')",
 "button.setAttribute('role','option')",
 "customerSearch.addEventListener('input'",
 "selectedCustomerId='';priorSelector=null;",
 "selectedCustomerId=String(item.id)",
 "p_customer_id:selectedCustomerId",
 "if(!selectedCustomerId)",
 "save.disabled=true;save.textContent='Thu tiền'",
 "refreshExisting();",
 "customerSearch.focus({preventScroll:true})",
 "event.key==='ArrowDown'",
 "event.key==='Enter'",
 "event.key==='Escape'"
])assert(js.includes(token), 'missing '+token);
assert(!js.includes("const customer=el('select','bank-review-select')"),
 'Native iOS customer picker must be removed');
assert(css.includes('.bank-review-customer-results'));
assert(css.includes('-webkit-overflow-scrolling:touch'));
assert(css.includes('font-size:16px!important'));
console.log('BANK-193 searchable customer input (Vietnamese accent, explicit selection, no native wheel) PASS');
