'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.source.html','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');

// P2 report owner keeps four critical KPIs in view. Secondary diagnostics
// are a native accessible disclosure, not removed or recomputed from UI data.
assert(html.includes('class="bank-report-status-strip bank-report-status-main" data-bank-status'));
assert(html.includes('<details class="bank-report-extra-metrics" data-bank-extra-metrics>'));
assert(html.includes('class="bank-report-extra-metrics-trigger"'));
assert(html.includes('data-bank-extra-status'));
assert(js.includes("extraStatus:root.querySelector('[data-bank-extra-status]')"));
assert(js.includes('ui.extraStatus?.replaceChildren();'),"auth rotation clears secondary bank details too");
assert(css.includes('.bank-report-status-strip.bank-report-status-main'));
assert(css.includes('.bank-report-status-strip.bank-report-status-extra'));
assert(css.includes('min-height:44px')&&css.includes('.bank-report-extra-metrics-trigger'));
assert(css.includes('#bankReportDashboard .bank-report-table tbody tr.bank-report-table-item'));
assert(css.includes('content:attr(data-mobile-label)'),"mobile headers remain meaningful");
assert(js.includes("for(const v of [g.name,g.matched,g.waiting,g.duplicate,g.old,bankDisplayVnd(g.money)])"),
  "all six original values remain in the table");
assert(js.includes("td.dataset.mobileLabel=i===5?'Đã ghi thu':shortColumns[i]"));
assert(css.includes('td:nth-child(6)::after'),"mobile customer amount has a clear collected label below");

// Execute the paint owner with a minimal local fake DOM to check the actual
// 2+2+6 split, repeated refresh, and a cached shell without the disclosure.
const begin=js.indexOf('function paint(data){');
const end=js.indexOf('function renderTable(data){',begin);
assert(begin>0&&end>begin);
const node=(name)=>({
 name,children:[],dataset:{},scrollTop:22,
 querySelectorAll(){return []},
 replaceChildren(...items){this.children=items},
 appendChild(...items){this.children.push(...items)},
 setAttribute(){},addEventListener(){}
});
const baseUi=()=>({
 summary:node('summary'),status:node('status'),extraStatus:node('extra'),
 table:node('table'),tabs:node('tabs'),groups:node('groups')
});
const record={
 summary:{matched_count:2,matched_amount:1311000,bill_only_count:1,
  old_date_count:0,duplicate_count:4},
 bank_only:[{notice_id:99}],
 manual_collections:[],
 bank_credits:[{amount_vnd:850000},{amount_vnd:461000},{amount_vnd:1482000}],
 bills:[{status:'amount_read'},{status:'review'}]
};
function verifyLayout(hasExtra){
 const ui=baseUi();if(!hasExtra)delete ui.extraStatus;
 const context={ui,root:{scrollTop:22},
   filter:'all',selectedCustomer:null,filters:[['all','Tất cả'],['matched','Đã khớp']],
   bankFilterMobileLabels:{all:'Tất cả',matched:'Đã khớp'},
   money:x=>String(x),bankDisplayVnd:x=>new Intl.NumberFormat('vi-VN').format(x)+'đ',
   isAiScanIssue:()=>false,
   // UI-only layout fixture: inject the verified view-model boundary.
   // BANK-307's real transaction collision behavior has independent tests.
   bankCreditViewModel:rows=>rows,
   bankCreditGroupingStatus:(groups,raw)=>({
    minVnd:groups.reduce((sum,x)=>sum+Number(x.amount_vnd||0),0),
    maxVnd:raw.reduce((sum,x)=>sum+Number(x.amount_vnd||0),0),
    candidateGroups:0,extraSignals:0
   }),
   bankResponsiveLabel:x=>({textContent:x}),
   cardValue:(name,value)=>({name,value}),
   el:(tag,className='',value='')=>Object.assign(node(tag),{className,textContent:value}),
   append:(parent,...children)=>{parent.appendChild(...children);return parent},
   renderTable:()=>{},renderGroups:()=>{}
 };
 vm.createContext(context);
 vm.runInContext(js.slice(begin,end)+'\nglobalThis.paint=paint;',context);
 context.paint(record);
 assert.equal(ui.summary.children.length,2);
 assert.equal(ui.status.children.length,hasExtra?2:8);
 if(hasExtra)assert.equal(ui.extraStatus.children.length,6);
 assert.equal(ui.status.children[0].value,'2');
 assert.equal(ui.status.children[1].value,'1',"bill count stays distinct from a bank-money amount");
 assert.equal(ui.summary.children[0].value,'2.793.000đ',"total bank credits remain the first financial KPI");
 assert.equal(ui.summary.children[1].value,'1.311.000đ',"collected amount remains visible as the second KPI");
 context.paint(record);
 assert.equal(ui.status.children.length,hasExtra?2:8,"refresh cannot drop bank totals");
 if(hasExtra)assert.equal(ui.extraStatus.children.length,6);
}
verifyLayout(true);
verifyLayout(false);
console.log('UI-270: 4 primary KPIs, 6 retained diagnostics, mobile two-line labels, old shell fallback PASS');
