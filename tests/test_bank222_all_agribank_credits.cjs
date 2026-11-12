'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','bank-report-dashboard.js'),'utf8');
const i=src.indexOf('function bankMoneyThousands('),end=src.indexOf('\nconst localDate=',i);
assert(i>=0&&end>i,'canonical bankMoneyThousands helper');
assert(src.slice(i,end).includes('const money=bankMoneyThousands;'),'dashboard uses canonical money helper');
const money=vm.runInNewContext(src.slice(i,end)+'\nmoney;',{Intl,Number,String,Math});
for(const [input,expected] of [[570000,'570'],[4305000,'4.305'],[4217000,'4.217'],[26000,'26'],[62000,'62'],[570050,'570 (lẻ 50₫)']]){
 assert.equal(money(input),expected,`Expected exact thousand-unit display for ${input}`);
}
assert(src.includes("client.rpc('chat_bank_all_credit_statuses'"),'all credits are fetched independently');
assert(src.includes("bank_credits:Array.isArray(credits.data)?credits.data:[]"));
assert(src.includes("const incomingStats=bankCreditGroupingStatus(groups,incoming);"),'bank credit display groups are accounted with disclosed ambiguity');
assert(src.includes("'bank_all','Tiền vào NH'"),'shorter label must preserve the full bank register filter');
assert(src.includes("kind==='auto_collected'?'Đã thu'"));
assert(src.includes("kind==='manual_collected'?'Đã thu thủ công'"));
assert(src.includes("kind==='unmatched'"),'manual collection button only for unmatched');
const section=src.slice(src.indexOf('function bankCreditLine('),src.indexOf('function renderGroups('));
assert(section.includes("if(kind==='unmatched'){"),'only bank-only receipts are actionable');
assert(section.includes("openCollectionDialog(row)"),'bank-only action preserved');
assert(section.includes("if(valid&&row.asset_id)"),'collected bank credits show the underlying bill');
assert(section.includes("cell('Ghi thu công nợ'"),'display the verified ledger state');
assert(section.includes("cell('Thông báo Agribank'"),'display bank-side evidence id');
assert(section.includes("kind==='review_inconsistent'"),'broken link must be held');
const grouping=src.slice(src.indexOf('function renderGroups('),src.indexOf('function openPush('));
assert(grouping.includes("const fullCredits=filter==='all'||filter==='bank_all'||filter==='manual_bank'"));
assert(grouping.includes("filter==='bank_only'?[...unlinkedCredits,...unmatchedLegacy]:[]"),
 'unlinked replay entries are reconciled with confirmed bank credits');
assert(grouping.includes("bankCreditLine(row,allBills):detailLine(row,true"),
 'grouped money-in and legacy unlinked rows use different safe details');
console.log('BANK-222: canonical money formatting, bank register, safe statuses and ledger links PASS');
