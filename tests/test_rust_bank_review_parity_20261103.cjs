'use strict';
// Shared fixture test: Rust's review pilot versus the deployed JS-only
// bank dashboard evidence function. Does NOT access Supabase, write money,
// or decide financial identity.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('bank-report-dashboard.js','utf8');
const start=src.indexOf('function vietnamBusinessDay(');
const end=src.indexOf('function detailLine(',start);
assert(start>=0&&end>start);
const vmState=vm.createContext({Date,Number,String});
vm.runInContext(src.slice(start,end),vmState);
const match=vmState.matchingManualCollectionForBill;
const fixtures=fs.readFileSync('rust/bank-review-guard/fixtures/review_cases.tsv','utf8')
 .split(/\r?\n/).filter(l=>l&&!l.startsWith('#'));
const dayIso=day=>day+'T07:47:00Z'; // 14:47 Vietnam time.
for(const line of fixtures){
 const cols=line.split('|');
 assert.equal(cols.length,7,line);
 const [name,status,account,day,bankKind,extraKind,expected]=cols;
 const bill={receipt_id:'sample-receipt',customer_id:'sample-customer',
  amount_vnd:975000,status,receiving_account:account==='EMPTY'?'':account,
  sent_at:dayIso(day),notice_id:null,ledger_id:null};
 const credit={notice_id:180,ledger_id:661,customer_id:bill.customer_id,
  amount_vnd:975000,transfer_at:dayIso('2026-11-02'),
  collection_kind:'manual_collected'};
 switch(bankKind){
  case 'collected':case 'duplicate':break;
  case 'uncollected':credit.collection_kind='unmatched';break;
  case 'wrong_customer':credit.customer_id='other-customer';break;
  case 'wrong_amount':credit.amount_vnd++;break;
  case 'wrong_day':credit.transfer_at=dayIso('2026-11-03');break;
  case 'no_ledger':credit.ledger_id=null;break;
  case 'none':break;
  default:throw Error('bad bank kind '+bankKind);
 }
 const credits=bankKind==='none'?[]:[credit];
 if(bankKind==='duplicate')credits.push({...credit,notice_id:181,ledger_id:662});
 const bills=[bill];
 if(extraKind==='same')bills.push({...bill,receipt_id:'second-bill'});
 else if(extraKind==='wrong_account')bills.push({...bill,receipt_id:'second-bill',receiving_account:'0000012345'});
 else if(extraKind==='linked')bills.push({...bill,receipt_id:'second-bill',notice_id:777});
 else assert.equal(extraKind,'none');
 const result=match(bill,{bills,bank_credits:credits})?'hint':'review';
 assert.equal(result,expected,name);
}
console.log('BANK-RUST-PARITY: '+fixtures.length+' identical read-only fixtures PASS');
