'use strict';
// BANK-227: a deferred bank deep-link cannot steal scroll/focus later.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('bank-report-dashboard.js','utf8');
const i=s.indexOf('function focusPushRecord(data){');
const j=s.indexOf('const REVIEW_REASONS=[',i);
assert(i>0&&j>i);
function fixture(){
 const callbacks=[],rows=[],scrolls=[];
 const row={dataset:{bankNoticeId:'180',bankReceiptId:'bill180'},open:false,
  scrollIntoView(){scrolls.push('row')}};
 rows.push(row);
 const ui={date:{value:'2026-11-02'},groups:{
  querySelectorAll:()=>rows,scrollIntoView(){scrolls.push('groups')}
 }};
 const ctx={ui,active:true,isReportContact:()=>true,
  reportSessionOwner:'A|S',bankReportSessionOwner:()=> 'A|S',requestId:17,
  filter:'all',selectedCustomer:null,pendingPush:{
   bankDay:'2026-11-02',bankNoticeId:'180',bankReceiptId:'bill180',bankStatus:'review'
  },paint(){},requestAnimationFrame(fn){callbacks.push(fn);}};
 vm.createContext(ctx);vm.runInContext(s.slice(i,j),ctx);
 const data={bills:[{receipt_id:'bill180',notice_id:'180',customer_id:'customer180'}],bank_only:[]};
 ctx.focusPushRecord(data);
 assert.equal(callbacks.length,1);
 return {ctx,flush:()=>callbacks.shift()(),row,scrolls};
}
const ok=fixture();ok.flush();assert.equal(ok.row.open,true);assert.deepEqual(ok.scrolls,['row']);
const switchOwner=fixture();switchOwner.ctx.reportSessionOwner='B|S';switchOwner.flush();
assert.deepEqual(switchOwner.scrolls,[]);assert.equal(switchOwner.row.open,false);
const changedDay=fixture();changedDay.ctx.ui.date.value='2026-11-03';changedDay.flush();
assert.deepEqual(changedDay.scrolls,[]);
const changedFilter=fixture();changedFilter.ctx.filter='bank_all';changedFilter.flush();
assert.deepEqual(changedFilter.scrolls,[]);
const changedRequest=fixture();changedRequest.ctx.requestId++;changedRequest.flush();
assert.deepEqual(changedRequest.scrolls,[]);
const hidden=fixture();hidden.ctx.active=false;hidden.flush();
assert.deepEqual(hidden.scrolls,[]);
console.log('BANK-227: deferred bank push scroll respects Admin owner/day/filter PASS');
