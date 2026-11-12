'use strict';
// BANK-313 visual signals are presentation rules only. No inferred ledger
// authority, no hidden status changes, and no edits to collection RPCs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.source.html','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');

const begin=js.indexOf('function bankReportBillTone(');
const end=js.indexOf('function detailLine(',begin);
assert(begin>0&&end>begin,'shared pure tone classification');
const api=vm.runInNewContext(js.slice(begin,end)+
 '\n({bankReportBillTone,bankReportCreditTone})',{
  String,isAiScanIssue:r=>String(r?.reason||'').startsWith('ai_scan_')
});
const bill=(report_status,extra={})=>({report_status,...extra});
assert.equal(api.bankReportBillTone(bill('matched',{ledger_id:853})),'success');
assert.equal(api.bankReportBillTone(bill('matched')),'danger',
 'no ledger means cannot signal already posted money');
assert.equal(api.bankReportBillTone(bill('waiting_bank')),'pending');
assert.equal(api.bankReportBillTone(bill('reading')),'pending');
assert.equal(api.bankReportBillTone(bill('bank_only')),'pending');
assert.equal(api.bankReportBillTone(bill('review')),'danger');
assert.equal(api.bankReportBillTone(bill('wrong_day')),'danger');
assert.equal(api.bankReportBillTone(bill('duplicate')),'danger');
assert.equal(api.bankReportBillTone(bill('review',{reason:'ai_scan_timeout'})),'danger');
assert.equal(api.bankReportBillTone(bill('non_bill')),'neutral');
assert.equal(api.bankReportBillTone(bill('waiting_bank'),false,null,{ledger_id:2}),'danger',
 'existing manual collection is an ambiguity, not a green automatic match');
assert.equal(api.bankReportBillTone(bill('waiting_bank'),false,null,null,true),'danger');
assert.equal(api.bankReportBillTone(bill('waiting_bank'),true,null,null,false,[]),'pending');
assert.equal(api.bankReportBillTone(bill('waiting_bank'),true,null,null,false,[{}]),'danger');
assert.equal(api.bankReportBillTone(bill('waiting_bank'),true,{ledger_id:777}),'success');

const credit=(collection_kind,extra={})=>({collection_kind,...extra});
assert.equal(api.bankReportCreditTone(credit('auto_collected',{ledger_id:853})),'success');
assert.equal(api.bankReportCreditTone(credit('manual_collected',{ledger_id:853})),'success');
assert.equal(api.bankReportCreditTone(credit('auto_collected')),'danger',
 'a paid label without proof of ledger must raise review');
assert.equal(api.bankReportCreditTone(credit('review_inconsistent')),'danger');
assert.equal(api.bankReportCreditTone(credit('unmatched',{bank_group_tentative:true}),
 {label:'Thiếu bill'}),'danger',
 'ambiguous bank replay never becomes yellow low-risk');
assert.equal(api.bankReportCreditTone(credit('unmatched'),
 {label:'Chưa thu · Thiếu bill'}),'pending');
assert.equal(api.bankReportCreditTone(credit('unmatched'),
 {label:'Chưa thu · Bill thiếu giờ'}),'danger');
assert.equal(api.bankReportCreditTone(credit('unmatched'),
 {label:'Chưa thu · Chờ xác minh bill'}),'danger');
assert.equal(api.bankReportCreditTone(credit('unmatched'),
 {label:'Chưa thu · AI nghi sai ngày'}),'danger');

const row=js.slice(js.indexOf('function detailLine('),js.indexOf('function bankUnmatchedIssue('));
const bank=js.slice(js.indexOf('function bankCreditLine('),js.indexOf('function renderGroups('));
assert(row.includes('wrap.dataset.bankTone=bankReportBillTone('));
assert(row.includes('statusText[type]'),'status names still sourced from original receipt status');
assert(bank.includes('wrap.dataset.bankTone=bankReportCreditTone(row,issue)'));
for(const label of ['Đã thu','Đã thu thủ công','Thiếu giờ · Xác minh','Nghi sai ngày',
 'Cần xác minh bill','Lệch sổ · Xác minh','Chưa có bill']){
 assert(bank.includes(label),label+' retains a precise visible textual status');
}
assert(js.includes("button.dataset.bankTone=item.key==='review'?'danger':'pending';"),
 'the review queue distinguishes red validation from yellow waiting');
assert(js.includes("bankDisplayVnd(g.money)")&&js.includes("bankDisplayVnd(row.amount_vnd)"));
assert(js.includes("const bankDisplayVnd=x=>bankMoneyThousands(x);"),
 'currency scaling remains /1,000, without per-row đồng suffix');

// Correct one financial line: 56px clock | flexible amount | bounded status.
const styles=css.slice(css.indexOf('/* BANK-313:'));
assert(styles.includes('grid-template-columns:56px minmax(0,1fr) minmax(0,max-content)'));
assert(styles.includes('font-variant-numeric:tabular-nums'));
for(const tone of ['success','pending','danger','neutral'])
 assert(styles.includes('[data-bank-tone="'+tone+'"]'),tone+' color token exists');
assert(styles.includes('--bank-tone-bg:#e5f5eb'), 'green');
assert(styles.includes('--bank-tone-bg:#fff2d5'), 'yellow');
assert(styles.includes('--bank-tone-bg:#ffe9e8'), 'red');
assert(styles.includes('max-width:117px'), 'badges avoid overlapping numerals on phone');
assert(styles.includes('max-width:104px'), 'badges fit at 320px');

// Fix mobile customer: main row [name | paid total], second row diagnostics
// with four quarter width grid tracks, never adjacent to 15.000 total.
assert(styles.includes('grid-template-columns:repeat(12,minmax(0,1fr))'));
assert(styles.includes('grid-column:1/8;grid-row:1'));
assert(styles.includes('grid-column:8/13;grid-row:1'));
for(const c of ['1/4','4/7','7/10','10/13'])
 assert(styles.includes('grid-column:'+c+';'),c+' diagnostic column');
assert(styles.includes('grid-row:2;align-self:start'));
assert(styles.includes('td[data-zero="true"]'),'hide zero counts on mobile only');
assert(styles.includes("content:attr(data-mobile-label)"),
 'mobile source numbers must keep their own labels');
assert(styles.includes('@media(max-width:760px)'));
assert(styles.includes('@media(max-width:540px)'));
assert(styles.includes('@media(max-width:360px)'));

// No backend/data changes in this patch; original collection logic persists.
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(html.includes('Số tiền ÷ 1.000 · Giờ VN 24h'));
console.log('BANK-313: green ledger / yellow waiting / red manual review, 3 aligned transaction columns, 2 clear customer rows PASS');
