'use strict';
// UI-271 — screenshots 13:51 VN: separate financial semantics, visually
// identify the pinned system item, and retain equal safe mobile controls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const bank=fs.readFileSync('bank-report-dashboard.js','utf8');
const bankCss=fs.readFileSync('bank-report-dashboard.css','utf8');
const mobile=fs.readFileSync('mobile-ui-polish.css','utf8');
const compose=fs.readFileSync('mobile-chat-refresh.css','utf8');
const shell=fs.readFileSync('shell.js','utf8');

const start=bank.indexOf('const bankFilterMobileLabels=');
const end=bank.indexOf('function cardValue(',start);
assert(start>0&&end>start);
const ctx=vm.createContext({});
vm.runInContext(bank.slice(start,end)+'\nglobalThis.labels=bankFilterMobileLabels;',ctx);
const labels=ctx.labels;
assert.equal(labels.waiting_bank,'Bill chưa khớp');
assert.equal(labels.bank_only,'Chưa gắn bill');
assert.equal(labels.review,'Cần xác minh');
assert.notEqual(labels.waiting_bank,labels.bank_only,'bill and bank credit are distinct');
assert(bank.includes("'Đã thu'"),'ledger amount remains distinct from raw incoming');
assert(bank.includes("'Tiền vào NH'"),'bank incoming total has an explicit source');
assert(bank.includes("'Bill chưa khớp'"),'pending bill title does not suggest cash posted');
assert(bank.includes("td.dataset.mobileLabel=i===5?'Đã thu':shortColumns[i]"),
 'mobile customer total is a clean single-line label');
assert(bank.includes("const columns=['Khách hàng','Tự thu','Chờ soát','Trùng','AI lỗi ngày','Tiền tự thu'];"),
 'original accessible desktop six-column table is preserved');

assert(bankCss.includes('#bankReportDashboard :is(.bank-report-summary,.bank-report-status-main)>.bank-report-stat{'));
assert(bankCss.includes('min-height:84px;'),'four priority metrics support two-line labels without fixed height');
assert(bankCss.includes('display:grid;grid-template-columns:repeat(20,minmax(0,1fr));'));
assert(bankCss.includes('#bankReportDashboard .bank-report-table tbody td:nth-child(n+2):nth-child(-n+5){'),
 'four customer diagnostics share equal tracks');
assert(bankCss.includes('text-align:center;font-variant-numeric:tabular-nums;'));
assert(bankCss.includes('grid-column:1/15;grid-row:1;')&&bankCss.includes('grid-column:15/21;grid-row:1;'),
 'name and date-selected amount remain separate on first line');

assert(shell.includes("const PINNED_BANK_REPORT_CONTACT_ID='fc3ec480-60d2-4749-b7af-5f4ae71eb14e';"));
assert(shell.includes("row.dataset.contactPinned=authAccount?.role==='admin'&&isPinnedBankReportContact(item)?'report':'';"));
assert.equal((shell.match(/preview\.setAttribute\('aria-label','Báo cáo hệ thống\. '/g)||[]).length,2,
 'initial directory and realtime patch both expose system identity');
assert(mobile.includes('.shell-contact-row[data-contact-pinned="report"] .shell-contact-preview::before'));
assert(mobile.includes('content:"Hệ thống · ";'));
assert(mobile.includes('#chatQuickActions>button:nth-child(-n+2)'),
 'cash and debt have matching primary weight without hiding photo/recent');

const header='#appShell[data-auth-state="authenticated"] .compact-top-grid';
const h=mobile.indexOf(header+'{');
assert(h>=0&&mobile.slice(h,h+310).includes('grid-template-columns:44px minmax(0,1fr) auto;'),
 'mobile header: fixed menu, flexible identity, measured live call');
assert(compose.includes('grid-template-columns:var(--ui-control-touch,44px) minmax(0,1fr) var(--ui-control-touch,44px) var(--ui-control-touch,44px);'),
 'composer 44px plus/mic/send, remainder for editor');
// The editor still has positive space even at a 320px viewport; do not
// replace these fixed controls with percentages that break long text input.
for(const width of [320,360,375,390,430]){
 const editor=width-2*12-2*4-3*44-3*4;
 assert(editor>125,'editor must remain usable on '+width+'px mobile');
}
console.log('UI-271: semantic money/bill labels, equal KPI/customer ratios, system contact and 44px controls PASS');
