'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.source.html','utf8');
const js=fs.readFileSync('bank-report-dashboard.js','utf8');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
const hide='body:has(#stageLayout[data-bank-report-active="true"]) .top-mode-tab[data-top-tab="photos"]';
assert(html.includes(hide),'Photos should hide only for the active bank report');
assert(html.includes(hide+'{\n  display:none!important;'),'Photos must actually be hidden');
assert(html.includes('body:has(#stageLayout[data-bank-report-active="true"]) .top-mode-switch{\n  grid-template-columns:minmax(0,1fr);'),
 'single remaining Chat tab must fill the header');
assert(html.includes('data-top-tab="photos" data-nav-target="photos">Ảnh</button>'),
 'the Photos tab still exists for ordinary conversations');
assert(js.includes("stage.dataset.bankReportActive=should?'true':'false'"),
 'existing report activation remains the sole display owner');
const begin=js.indexOf('function bankCreditLine('),end=js.indexOf('function renderGroups(data){',begin);
assert(begin>0&&end>begin,'bank row renderer must be preserved');
const source=js.slice(begin,end);
for(const snippet of [
 "el('details','bank-report-detail bank-report-credit')",
 "wrap.addEventListener('toggle'",
 "if(!wrap.open||!ui.groups?.contains?.(wrap))return",
 "ui.groups.querySelectorAll('.bank-report-credit[open]')",
 "if(peer!==wrap)peer.open=false",
 "el('section','bank-report-memo-compare')",
 "compare.setAttribute('aria-label','So sánh nội dung chuyển khoản')",
 "compare.appendChild(cell('Nội dung Agribank'",
 "if(linkedBill)compare.appendChild(cell('Nội dung trên bill'",
 "Chưa có bill liên kết để so sánh nội dung."
])assert(source.includes(snippet),'missing expected memo or toggle UI: '+snippet);
const memoStart=source.indexOf('const bankContent=String(row.bank_memo');
const memoEnd=source.indexOf("const compare=el('section','bank-report-memo-compare')",memoStart);
assert(memoStart>0&&memoEnd>memoStart);
const extract=new Function('row','allBills',
 source.slice(memoStart,memoEnd)+'\nreturn {bankContent,linkedBill,billContent};');
const matched=extract({
 receipt_id:'same-id',bank_memo:'LAI VAN TAN chuyen tien'
},[{receipt_id:'same-id',bill_ocr:{transfer_content:'LAI VAN TAN chuyen tien'}},
  {receipt_id:'not-this-id',bill_ocr:{transfer_content:'different person'}}]);
assert.equal(matched.bankContent,'LAI VAN TAN chuyen tien');
assert.equal(matched.billContent,'LAI VAN TAN chuyen tien');
assert.equal(matched.linkedBill.receipt_id,'same-id');
const unlinked=extract({
 receipt_id:null,bank_memo:'',
 bank_body:'Agribank. Nội dung giao dịch: NOI DUNG GOC. Số dư cuối: 1000 VND'
},[{receipt_id:'unrelated',bill_ocr:{transfer_content:'DO NOT SHOW'}}]);
assert.equal(unlinked.linkedBill,null,'never select a bill solely by similar amount or customer');
assert.equal(unlinked.billContent,'');
assert.equal(unlinked.bankContent,'NOI DUNG GOC');
const sourceStyle=css.slice(css.indexOf('/* UI-332: one-tap Agribank accordion'));
assert(sourceStyle.includes('#bankReportDashboard .bank-report-memo-compare'));
assert(sourceStyle.includes('grid-template-columns:minmax(0,1fr)'), 'phone comparison uses readable stacked labels');
assert(sourceStyle.includes('white-space:pre-wrap'));
assert(sourceStyle.includes('overflow-wrap:anywhere'));
assert(sourceStyle.includes('@media(max-width:760px)'));
assert(js.includes("client.rpc('chat_bank_dashboard'"));
assert(js.includes("client.rpc('chat_bank_bill_manual_collect'"));
assert(js.includes("client.rpc('chat_bank_daily_transfer_send_manual'"));
console.log('UI-332: Photos hidden only in report, one-tap Agribank memo comparison and original finance RPC PASS');
