'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','bank-report-dashboard.js'),'utf8');
const section=(start,end)=>{
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0&&b>a,'bank report helper present: '+start);
 return source.slice(a,b);
};
const pure=[
 section('function billHasSuspectSwappedDay(', '\nconst statusText='),
 section('function vietnamBusinessDay(', '// BANK-223-MANUAL-REVIEW'),
 section('function bankUnmatchedIssue(', '// BANK-222: full bank money-in')
].join('\n');
const issue=vm.runInNewContext(pure+'\nbankUnmatchedIssue;', {Date,Number,String,Math});
const n=(id,amount,utc)=>({notice_id:id,amount_vnd:amount,transfer_at:utc});
const b=(amount,utc,billTime)=>({
 receipt_id:'test-bill',asset_id:'test-asset',amount_vnd:amount,
 sent_at:utc,status:'amount_read',bill_time:billTime,notice_id:null,
 ledger_id:null,report_status:'waiting_bank'
});
assert.equal(issue(n(242,10000000,'2026-11-10T03:45:00Z'),[]).label,
 'Chưa thu · Thiếu bill');
assert.equal(issue(n(249,364000,'2026-11-10T11:06:00Z'),[
 b(364000,'2026-11-10T11:06:08Z','2026-10-11 18:06')
]).label,'Chưa thu · AI nghi sai ngày');
assert.equal(issue(n(250,91000,'2026-11-10T11:06:00Z'),[
 b(91000,'2026-11-10T11:06:39Z','2026-10-11 18:06')
]).label,'Chưa thu · AI nghi sai ngày');
assert.equal(issue(n(243,377000,'2026-11-10T07:38:00Z'),[
 b(377000,'2026-11-10T07:39:00Z',null)
]).label,'Chưa thu · Bill thiếu giờ');
assert.equal(issue(n(240,400000,'2026-11-10T02:19:00Z'),[
 b(400000,'2026-11-10T02:19:15Z',null)
]).label,'Chưa thu · Bill thiếu giờ');
assert.equal(issue(n(248,220000,'2026-11-10T11:06:00Z'),[
 b(220000,'2026-11-10T11:06:10Z','2026-11-10 18:06')
]).label,'Chưa thu · Chờ xác minh bill');
assert.equal(issue(n(249,364000,'2026-11-10T11:06:00Z'),[
 {...b(364000,'2026-11-10T11:06:08Z','2026-10-11 18:06'),status:'received'}
]).label,'Chưa thu · Thiếu bill','received bill never becomes an unlinked collection candidate');
assert.match(source,/const issue=kind==='unmatched'\?bankUnmatchedIssue\(row,allBills\):null/);
assert.match(source,/kind==='review_inconsistent'\?'Liên kết cần kiểm tra':/);
assert.match(source,/candidate\?'Chờ soát thông báo':issue\?\.label/,
 'BANK-307 preserves unmatched cause, but tentative replay groups cannot masquerade as unpaid money');
assert.match(source,/if\(issue\)content\.appendChild/);
assert.doesNotMatch(pure,/\.rpc\(|db\.from\(|openCollectionDialog\(/,
 'pure helper cannot post money, submit a report or create a transaction');
console.log('BANK-268: uncollected bank credits give true diagnostic; no auto-collect state changes PASS');
