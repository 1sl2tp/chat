'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'bank-report-dashboard.js'),'utf8');
const start=src.indexOf('// BANK-309: deduplicate notifications BEFORE any reporting/counting/UI.');
const end=src.indexOf('function renderBankWorkQueue(',start);
assert(start>0&&end>start,'BANK-307 pure view model precedes admin dashboard rendering');
const helpers=vm.runInNewContext(src.slice(start,end)+
 '\n({bankCreditViewModel,bankCreditGroupingStatus,bankLineClock})',
 {Number,String,Map,Array,Math,agribankDisplayTime:(raw)=>{
  const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(raw||''));
  return m?m[4]+':'+m[5]+' '+m[3]+'/'+m[2]+'/'+m[1]:'—';
 }});
const credit=(id,amount,time,kind='unmatched',ledger=null,fp='')=>({
 notice_id:String(id),bank_credit_account:'2901181999999',
 bank_time:'2026-11-12 '+time,amount_vnd:amount,collection_kind:kind,
 ledger_id:ledger&&String(ledger),fingerprint:fp
});
// Real bank-event shapes from incident, synthetic identifiers are safe.
const input=[
 credit(269,2000000,'09:17:00','auto_collected',849),
 credit(270,3000000,'15:33:00','auto_collected',850),
 credit(271,10000000,'17:41:00','auto_collected',852),
 credit(272,2022000,'19:10:00','auto_collected',853),
 credit(279,2022000,'19:10:00'),
 credit(273,463000,'19:13:00','auto_collected',854),
 credit(277,463000,'19:13:00'),
 credit(274,730000,'19:31:00'),
 credit(280,730000,'19:31:00')
];
const grouped=helpers.bankCreditViewModel(input);
assert.equal(grouped.length,6,'three repeated APK events are one review cluster each');
const sum=helpers.bankCreditGroupingStatus(grouped,input);
assert.equal(sum.minVnd,18215000,'no double counting in grouped display');
assert.equal(sum.maxVnd,21430000,'raw possible upper bound remains visible');
assert.equal(sum.candidateGroups,3,'never claim legacy tuple means verified duplicate');
assert.equal(sum.extraSignals,3);
assert.equal(grouped.find(r=>r.amount_vnd===2022000).ledger_id,'853',
 'preserve verified collection link, not replayed unmatched record');
assert.equal(grouped.find(r=>r.amount_vnd===463000).collection_kind,'auto_collected');
assert.equal(grouped.find(r=>r.amount_vnd===730000).bank_group_tentative,true);
assert.equal(grouped.find(r=>r.amount_vnd===730000).bank_group_count,2);
assert.equal(helpers.bankLineClock('2026-11-12 19:10:00'),'19:10 · 12/11');
assert.equal(helpers.bankLineClock(''),'Chưa có giờ NH');
// Do not merge independent same-amount credits from different clock seconds.
const seconds=helpers.bankCreditViewModel([
 credit(111,500000,'10:01:04'),credit(112,500000,'10:01:45')
]);
assert.equal(seconds.length,2);
// If full trusted fingerprints differ, even the SAME second cannot be merged.
const fpa='a'.repeat(64),fpb='b'.repeat(64);
const differentFingerprints=helpers.bankCreditViewModel([
 credit(21,700000,'14:10:00','unmatched',null,fpa),
 credit(22,700000,'14:10:00','unmatched',null,fpb)
]);
assert.equal(differentFingerprints.length,2);
// Two independent verified ledger rows are never grouped by a coincident clock.
const distinctLedger=helpers.bankCreditViewModel([
 credit(33,900000,'15:00:00','auto_collected',34),
 credit(34,900000,'15:00:00','auto_collected',35)
]);
assert.equal(distinctLedger.length,2);
// Same actual fingerprint in two device notifications is definite evidence.
const exact=helpers.bankCreditViewModel([
 credit(101,120000,'11:22:00','auto_collected',5,fpa),
 credit(102,120000,'11:22:00','unmatched',null,fpa)
]);
assert.equal(exact.length,1);
assert.equal(exact[0].bank_group_exact,true);
assert.equal(exact[0].bank_group_tentative,false);
assert(src.includes("if(!candidate){"),'no direct collection from tentative duplicate cluster');
assert(src.includes("Đã gom '+count+' dòng giống nhau"),'legacy API only groups for display without a false bank-duplicate banner');
assert(src.includes("allBills.filter(r=>r.report_status==='waiting_bank'&&!r.ledger_id)"),
 'show outstanding customer bill even without bank notification');
assert(src.includes("giờ trên bill, không phải giờ Agribank"),'never mislabel upload/bill time as confirmed bank hour');
assert(src.includes("bankLineClock(row.bank_time,ui.date.value)"),'bank rows show exact bank date and time');
assert(src.includes("Giờ Agribank (đến phút)"),'bank time precision never overstated');
assert(src.includes("Giờ máy chủ nhận thông báo"),'APK/server arrival time is separate from official bank time');
const fingerprintMigration=fs.readFileSync(path.join(root,
 'supabase/migrations/20261112204500_bank307_admin_notification_fingerprint_and_arrival_time.sql'),'utf8');
assert.match(fingerprintMigration,/n\.fingerprint,n\.received_at/);
assert.match(fingerprintMigration,/chat_bank_all_credit_statuses\(uuid,date\)/);
assert.doesNotMatch(fingerprintMigration,/(?:DELETE FROM|UPDATE|INSERT INTO) public\.(?:taphoa_debt_ledger|taphoa_agribank_notifications)/i);

assert(src.includes("const outstanding=groups.filter"),'work queue is grouped consistently');
console.log('BANK-307: same-source replay, no false ledger, ambiguous same-second credit, clock and pending bill PASS');
