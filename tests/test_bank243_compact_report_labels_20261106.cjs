'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');

const begin=source.indexOf('function bankResponsiveLabel(');
const end=source.indexOf('function paint(data){',begin);
assert(begin>0&&end>begin,'responsive labels must live beside bank report card renderer');
function element(tag,className='',value=''){
 return {tag,className,textContent:String(value),children:[],attributes:{},title:'',
  setAttribute(key,value){this.attributes[key]=String(value);},
  appendChild(child){this.children.push(child);return child;}};
}
const context={
 el:element,
 append:(parent,...children)=>{for(const child of children)parent.appendChild(child);return parent;},
};
vm.createContext(context);
vm.runInContext(source.slice(begin,end)+'\nglobalThis.testing={bankResponsiveLabel,bankFilterMobileLabels,cardValue};',context);
const {bankResponsiveLabel,bankFilterMobileLabels,cardValue}=context.testing;
const textFrom=(node)=>[node.textContent,...node.children.map(textFrom)].join('');

const card=cardValue('Tổng tiền vào Agribank (÷1.000)','32.457',false,true,'Tổng tiền NH (nghìn)');
const caption=card.children[0];
assert.equal(card.children[1].textContent,'32.457','numeric data must never be abbreviated');
assert.equal(caption.title,'Tổng tiền vào Agribank (÷1.000)');
const responsive=caption.children[0];
assert.equal(responsive.attributes['aria-label'],'Tổng tiền vào Agribank (÷1.000)');
assert.equal(responsive.children[0].textContent,'Tổng tiền vào Agribank (÷1.000)');
assert.equal(responsive.children[1].textContent,'Tổng tiền NH (nghìn)');
assert.equal(responsive.children[1].attributes['aria-hidden'],'true');
assert.equal(responsive.title,'Tổng tiền vào Agribank (÷1.000)');

assert.equal(bankFilterMobileLabels.waiting_bank,'Bill chờ NH');
assert.equal(bankFilterMobileLabels.bank_only,'NH chưa khớp');
assert.equal(bankFilterMobileLabels.manual_bank,'Thu tay NH');
assert.equal(bankFilterMobileLabels.matched,'Đã khớp');

const h=source.slice(source.indexOf('function renderTable(data){'),source.indexOf('// BANK-183-',source.indexOf('function renderTable(data){')));
for(const expected of [
 "['Khách hàng','Khách']",
 "['Tự thu','Tự thu']",
 "['Chờ soát','Chờ']",
 "['Trùng','Trùng']",
 "['Sai ngày','Sai']",
 "['Tiền tự thu','Tiền thu']"
])assert(h.includes(expected),'table header must use expected short label: '+expected);
assert(h.includes('th.setAttribute(\'aria-label\',name);'),'column titles preserve full meaning');
assert(h.includes("for(const v of [g.name,g.matched,g.waiting,g.duplicate,g.old,money(g.money)])"),
 'all six original numerical columns must stay in place');

assert(css.includes('.bank-report-responsive-label .bank-report-label-full{display:inline}'));
assert(css.includes('.bank-report-responsive-label .bank-report-label-short{display:none}'));
assert(css.includes('@media (max-width:540px)'),'compact mode must be restricted to phones');
assert(css.includes('#bankReportDashboard .bank-report-responsive-label .bank-report-label-short{display:inline}'));
assert(css.includes('#bankReportDashboard .bank-report-table th:nth-child(6){width:30%}'));
assert(css.includes('@media (max-width:360px)'),'very narrow phones need smaller table type');
console.log('BANK-243 short phone labels, original financial values and full accessibility names PASS');
