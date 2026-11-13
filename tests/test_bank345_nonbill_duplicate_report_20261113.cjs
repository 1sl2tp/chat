'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const report=fs.readFileSync('bank-report-dashboard.js','utf8');
const edge=fs.readFileSync('supabase/functions/v21-bank-bill-event/index.ts','utf8');
const begin=report.indexOf('function bankReportVisibleData(data){');
const end=report.indexOf('function renderBankWorkQueue(',begin);
assert(begin>=0&&end>begin,'report must have single non-bill gate');
const normalize=vm.runInNewContext(report.slice(begin,end)+'\nbankReportVisibleData;',
 {Array,Number,String});
const raw={
 summary:{duplicate_count:3,matched_amount:7000,matched_count:1,bill_only_count:1},
 bank_credits:[{notice_id:'bank-1',amount_vnd:55098000}],
 bills:[
  {receipt_id:'old-image',report_status:'non_bill',amount_vnd:null},
  {receipt_id:'hue-carton',report_status:'duplicate',reason:'duplicate_exact_image_sha256_no_ai',amount_vnd:null,duplicate_of:'old-image'},
  {receipt_id:'real-bill-copy',report_status:'duplicate',reason:'duplicate_exact_image_sha256_no_ai',amount_vnd:1343000},
  {receipt_id:'reference-duplicate',report_status:'duplicate',reason:'duplicate_verified_transfer_reference',amount_vnd:7000},
  {receipt_id:'lan-bill',report_status:'waiting_bank',amount_vnd:1343000},
  {receipt_id:'ocr-failed',report_status:'review',reason:'amount_scan_gemini_invalid_json',amount_vnd:null},
  {receipt_id:'collected',report_status:'matched',amount_vnd:7000}
 ]
};
const clean=normalize(raw);
const ids=clean.bills.map(r=>r.receipt_id);
assert(!ids.includes('old-image'));
assert(!ids.includes('hue-carton'),'2026-11-13 C Hue repeated carton photo is not a duplicate bill');
for(const id of ['real-bill-copy','reference-duplicate','lan-bill','ocr-failed','collected'])
 assert(ids.includes(id),id+' must remain');
assert.equal(clean.summary.duplicate_count,2,'non-bill repeat cannot inflate duplicate count');
assert.equal(clean.summary.matched_amount,7000);
assert.equal(clean.summary.bill_only_count,1);
assert.equal(clean.bank_credits,raw.bank_credits,'bank evidence is never filtered');
assert.equal(raw.bills.length,7,'read-only presentation must not mutate source');
assert(report.includes('data=bankReportVisibleData(data);'),'every view must apply the same gate');
assert(!report.includes("['non_bill','Không phải bill']"),'non-bill must not have a business report tab');
const classification=edge.indexOf('if(firstReceipt.status==="non_bill")');
const duplicateWrite=edge.indexOf('await finish(asset,{status:"duplicate",reason:"duplicate_exact_image_sha256_no_ai"');
assert(classification>0&&duplicateWrite>classification,
 'source image classification must precede duplicate bill classification');
assert(edge.includes('if(firstError||!firstReceipt)throw new Error("hash_registry_lookup_failed")'));
assert(edge.includes('status:"non_bill",reason:"same_image_as_confirmed_non_bill"'));
assert(edge.includes('status:"review",reason:"duplicate_origin_bill_unverified"'));
assert(edge.includes('scan_status:classification==="non_bill"?"non_bill"'));
assert(edge.includes('ledger_written:false'),'classification never posts a debt payment');
console.log('BANK-345 PASS: non-bill original/repeat hidden, verified bills and bank credits retained, no ledger mutation');
