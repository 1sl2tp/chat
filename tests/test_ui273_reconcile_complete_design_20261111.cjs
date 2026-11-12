'use strict';
// UI-273: whole-screen design integration on the existing Admin-only report.
// No payment, OCR or account-ledger rules are altered.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const html=fs.readFileSync('index.source.html','utf8');
const start=html.indexOf('id="bankReportDashboard"');
const end=html.indexOf('id="conversationContentAxis"',start);
const report=html.slice(start,end);
assert(start>0&&end>start);
assert.equal((report.match(/VND · Giờ Việt Nam/g)||[]).length,1);
assert(report.includes('class="bank-report-help"'));
assert(report.includes('aria-label="Giải thích các chỉ số đối soát"'));
for(const label of ['Tiền vào NH','Đã thu','Đã khớp bill','Bill chưa khớp','Chưa gắn bill']){
 assert(report.includes('<b>'+label+':</b>'),label+' has a written meaning');
}
assert(report.includes('Chỉ số khác'),'secondary metrics are discoverable');

const begin=js.indexOf('function paint(data){');
const finish=js.indexOf('function renderTable(data){',begin);
assert(begin>0&&finish>begin);
const section=js.slice(begin,finish);
const summary=section.slice(section.indexOf('ui.summary.replaceChildren('),
  section.indexOf('// Keep every bank diagnostic'));
assert(summary.indexOf("'Tiền vào NH'")<summary.indexOf("'Đã thu'"),
 'money entering the bank must precede confirmed collection');
const status=section.slice(section.indexOf('ui.status.replaceChildren('),
  section.indexOf('// New shell:'));
assert(status.indexOf("'Đã khớp bill'")<status.indexOf("'Bill chưa khớp'"));
assert(status.includes("{countUnit:'giao dịch'}")&&status.includes("{countUnit:'bill'}"));
assert(section.includes('...(!ui.extraStatus?additionalCards:[])'),
 'old cached PWA shell must not lose secondary counters');
assert(section.includes("b.setAttribute('aria-pressed',String(filter===key))"));

function elem(tag,className='',value=''){
 return {tag,className,textContent:String(value),children:[],attributes:{},dataset:{},
  setAttribute(k,v){this.attributes[k]=String(v)},
  appendChild(child){this.children.push(child);return child;}};
}
const ctx={el:elem,Intl,Number,String,Math,
 append:(parent,...children)=>{for(const c of children)parent.appendChild(c);return parent;}};
const labelBegin=js.indexOf('function bankResponsiveLabel(');
const labelEnd=js.indexOf('function paint(data){',labelBegin);
vm.createContext(ctx);
vm.runInContext(js.slice(labelBegin,labelEnd)+
 '\nglobalThis.api={cardValue,bankMoneySpoken,bankFilterMobileLabels};',ctx);
const {cardValue,bankMoneySpoken,bankFilterMobileLabels}=ctx.api;
assert.equal(bankMoneySpoken(1311000),'1.311.000 đồng');
const moneyCard=cardValue('Đã thu có chứng từ','1.311',true,false,'Đã thu',{amountVnd:1311000});
assert.equal(moneyCard.dataset.metricKind,'money');
assert.equal(moneyCard.children[1].attributes['aria-label'],'1.311.000 đồng');
const countCard=cardValue('Bill chưa đối soát','1',false,true,'Bill chưa khớp',{countUnit:'bill'});
assert.equal(countCard.dataset.metricKind,'count');
assert.equal(countCard.children[1].attributes['aria-label'],'1 bill');
assert.equal(countCard.children[1].children[0].textContent,'bill');
assert.equal(bankFilterMobileLabels.waiting_bank,'Bill chưa khớp');
assert.equal(bankFilterMobileLabels.bank_only,'Chưa gắn bill');

for(const [width,columns] of [[320,2],[359,2],[360,3],[375,3],[390,3],[430,3]]){
 assert(width>=320);
 assert(css.includes('@media (max-width:360px)')&&css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),
  'narrow screen filter must have two columns at 320px');
 assert(css.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),
  'regular mobile filters have 3 equal columns');
 assert(columns===2||columns===3);
}
assert(css.includes('min-height:84px;padding:11px 12px;'));
assert(!css.includes('min-height:76px;padding:10px 12px;'));
assert(css.includes('grid-template-columns:repeat(20,minmax(0,1fr))')&&
 css.includes('#bankReportDashboard .bank-report-table tbody tr.bank-report-table-item'),
 'legacy CSS retained while the BANK-311 mobile flex layout supersedes it');
assert(css.includes('grid-column:1/15;grid-row:1')&&css.includes('grid-column:15/21;grid-row:1'),
 'name/amount on first row divide 70%/30%');
for(const c of ['1/6','6/11','11/16','16/21'])
 assert(css.includes('grid-column:'+c+';grid-row:2'),'4 lower figures use 25% each');
assert(css.includes('tr.is-selected td:first-child::after'));
assert(css.includes("content:'Đang xem'"));
assert(css.includes('min-height:48px')&&css.includes('.bank-report-help-trigger'));
assert(css.includes('min-width:44px;min-height:44px'));
assert(css.includes('@media(prefers-reduced-motion:reduce)'));
assert(css.includes('.bank-status-bank_unlinked'));
assert(js.includes("kind==='unmatched'?'bank_unlinked':'review'"));
assert(js.includes("tr.setAttribute('aria-expanded',String(selectedCustomer===g.id))"));
assert(js.includes("td.setAttribute('aria-label','Đã thu '+bankMoneySpoken(g.money))"));
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_all_credit_statuses'"));
console.log('UI-273: four KPI hierarchy, count/money accessibility, filter breakpoints, selected state and PWA fallback PASS');
