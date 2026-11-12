'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','bank-report-dashboard.js'),'utf8');
const section=(start,end)=>{
 const a=src.indexOf(start),b=src.indexOf(end,a);
 assert(a>=0&&b>a,'Missing '+start);
 return src.slice(a,b);
};
// Test the actual dashboard's read-only matching policy, not a reimplementation.
const pure=[
 section('function billHasSuspectSwappedDay(', '\nconst statusText='),
 section('function vietnamBusinessDay(', '// BANK-223-MANUAL-REVIEW-20261102:')
].join('\n');
const suggest=vm.runInNewContext(pure+'\nbankBillCustomerSuggestion;',{
 Date,Math,Number,String,Array,RegExp
});
const credit={
 notice_id:'268',collection_kind:'unmatched',amount_vnd:10157000,
 bank_time:'2026-11-11 21:53:00',
 transfer_at:'2026-11-11T14:53:00Z'
};
const bill={
 receipt_id:'88706591-590e-4acb-8911-338ac1cd0ef7',
 asset_id:'asset-unique',status:'amount_read',report_status:'review',
 amount_vnd:10157000,notice_id:null,ledger_id:null,
 customer_id:'10ca2a81-0a93-4668-9682-31d8395c5770',
 customer_name:'C Hà Trang',sent_at:'2026-11-11T14:53:30Z',
 bill_time:'2026-11-11 21:53:00',receiving_account:'290118199999'
};
assert.equal(suggest(credit,[bill]).customer_name,'C Hà Trang',
 'One complete exact-minute bill can be suggested to the Admin, not posted');
const disallowed=[
 [credit,[]],
 [credit,[bill,{...bill,asset_id:'competing-image',receipt_id:'other-id'}]],
 [credit,[{...bill,bill_time:null}]],
 [credit,[{...bill,bill_time:'2026-11-11 21:54:00'}]],
 [credit,[{...bill,receiving_account:'290118188888'}]],
 [credit,[{...bill,receiving_account:null}]],
 [credit,[{...bill,customer_id:null}]],
 [credit,[{...bill,notice_id:'268'}]],
 [credit,[{...bill,ledger_id:'999'}]],
 [credit,[{...bill,amount_vnd:10158000}]],
 [credit,[{...bill,status:'received'}]],
 [credit,[{...bill,sent_at:'2026-11-10T14:53:30Z'}]],
 [{...credit,collection_kind:'auto_collected'},[bill]],
 [{...credit,bank_time:'2026-11-11 21:55:00'},[bill]],
 [{...credit,amount_vnd:10158000},[bill]]
];
for(const [bank,bills] of disallowed){
 assert.equal(suggest(bank,bills),null,'Unsafe/ambiguous bill cannot be suggested');
}
// The click is advisory only. It cannot auto-select or auto-debit before a
// human action, and the actual financial write remains session-bound.
const body=section('async function openCollectionDialog(', '\nfunction closeViewer(');
const segment=section('const suggestedCustomer=suggestedBill', '  const paintCustomers=()=>{');
assert.match(segment,/suggest\.addEventListener\('click',/);
assert.match(segment,/chooseCustomer\(suggestedCustomer\)/);
assert.match(segment,/customers\.find\(/);
assert.doesNotMatch(segment,/\.rpc\(|ledger_id\s*=|verified\.checked\s*=\s*true/);
assert.match(body,/if\(!prepared\|\|!verified\.checked/);
assert.match(body,/client\.rpc\('chat_bank_manual_collection_prepare'/);
assert.match(body,/client\.rpc\('chat_bank_manual_collect'/);
assert.match(body,/p_app_session_id:auth\.appSessionId/);
assert.match(body,/if\(priorSelector&&!priorSelector\.value\)/);
assert.match(src,/reviewBillSuggestion:suggestion/);
assert.match(src,/async function openCollectionDialog\(bank\)\{/);
assert.doesNotMatch(pure,/\.rpc\(|db\.from\(/);
console.log('BANK-289 historical credit: single exact-minute suggestion; human Admin confirmation and duplicate guards PASS');
