'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'bank-report-dashboard.js'),'utf8');
const start=src.indexOf('// BANK-309: deduplicate notifications BEFORE any reporting/counting/UI.');
const end=src.indexOf('function bankLineClock(',start);
assert(start>0&&end>start);
const {bankCreditViewModel,bankCreditGroupingStatus}=vm.runInNewContext(
 src.slice(start,end)+'\n({bankCreditViewModel,bankCreditGroupingStatus})',
 {Number,String,Map,Array,Math}
);
const make=(id,amount,time,bal,memo,ledger=null,fp='')=>({
 notice_id:String(id),amount_vnd:amount,
 bank_credit_account:'2901181999999',
 bank_time:'2026-11-12 '+time,bank_balance_text:bal,
 bank_memo:memo,ledger_id:ledger?String(ledger):null,
 collection_kind:ledger?'auto_collected':'unmatched',fingerprint:fp
});
const credit=[
 make(269,2000000,'09:17:00','-139,114,730','DINH THI TUYET chuyen tien',849,'a'.repeat(64)),
 make(270,3000000,'15:33:00','-136,114,730','MB(046501)(NGUYEN THI OANH chuyen tien)',850,'b'.repeat(64)),
 make(271,10000000,'17:41:00','-126,114,730','NGUYEN THI SINH Chuyen tien',852,'c'.repeat(64)),
 make(272,2022000,'19:10:00','-116,092,730','MAI THI THANH chuyen tien',853,'d'.repeat(64)),
 make(279,2022000,'19:10:00','-116,092,730','MAI THI THANH chuyen tien',null,'d'.repeat(64)),
 make(273,463000,'19:13:00','-115,629,730','NGUYEN THU TRANG chuyen tien',854,'e'.repeat(64)),
 make(277,463000,'19:13:00','-115,629,730','NGUYEN THU TRANG chuyen tien',null,'e'.repeat(64)),
 make(274,730000,'19:31:00','-114,899,730','LAI VAN TAN chuyen tien',null,'f'.repeat(64)),
 make(280,730000,'19:31:00','-114,899,730','LAI VAN TAN chuyen tien',null,'f'.repeat(64)),
 make(281,5075000,'20:34:00','-109,824,730','PHAM VAN TINH chuyen tien',855,'0'.repeat(64)),
 make(282,3156000,'20:37:00','-106,668,730','QR - Ng Luong chuyen khoan nhanh qua Zalo',856,'1'.repeat(64))
];
const grouped=bankCreditViewModel(credit);
assert.equal(grouped.length,8,'11 notifications become eight real bank events');
const stats=bankCreditGroupingStatus(grouped,credit);
assert.equal(stats.extraSignals,3);
assert.equal(stats.minVnd,26446000,'correct source bank total excludes three replays');
assert.equal(stats.maxVnd,29661000,'raw total retained internally only');
assert.equal(stats.candidateGroups,0,'verified bank proofs are not customer review warnings');
assert.equal(grouped.find(x=>x.amount_vnd===2022000).ledger_id,'853');
assert.equal(grouped.find(x=>x.amount_vnd===463000).ledger_id,'854');
assert.equal(grouped.find(x=>x.amount_vnd===730000).bank_group_exact,true);
const noFingerprint=credit.map(({fingerprint,...r})=>r);
assert.equal(bankCreditViewModel(noFingerprint).length,8,
  'bank balance+memo+account+clock+amount independently dedupe replay events');
const newDeviceFP=credit.map(x=>({...x,fingerprint:
 x.notice_id==='280'?'2'.repeat(64):x.fingerprint}));
assert.equal(bankCreditViewModel(newDeviceFP).length,8,
 'same bank proof with changed Android push time still deduplicates');
const differentBalance=[
 make(991,500000,'18:01:00','-5,000,000','SAME MEMO',null,'3'.repeat(64)),
 make(992,500000,'18:01:00','-4,500,000','SAME MEMO',null,'4'.repeat(64))
];
assert.equal(bankCreditViewModel(differentBalance).length,2,
 'distinct final bank balances never combine even with equal amount and time');
const differentMemo=[
 make(993,500000,'18:01:00','-5,000,000','A CHUYEN',null,'5'.repeat(64)),
 make(994,500000,'18:01:00','-5,000,000','B CHUYEN',null,'6'.repeat(64))
];
assert.equal(bankCreditViewModel(differentMemo).length,2,
 'different transfer memos must stay independent');
const differentLedger=[
 make(995,500000,'18:01:00','-5,000,000','SAME',100,'7'.repeat(64)),
 make(996,500000,'18:01:00','-5,000,000','SAME',101,'7'.repeat(64))
];
assert.equal(bankCreditViewModel(differentLedger).length,2,
 'distinct ledger IDs may not be hidden even if bank proof collides');
const legacy=credit.map(({fingerprint,bank_balance_text,bank_memo,...r})=>r);
const legacyRows=bankCreditViewModel(legacy),legacyStats=bankCreditGroupingStatus(legacyRows,legacy);
assert.equal(legacyRows.length,8,'old RPC fallback shows one display row per same second tuple');
assert.equal(legacyStats.candidateGroups,3);
assert(legacyRows.find(r=>r.notice_id==='274').bank_group_tentative);
assert(src.includes('if(!candidate){'),'do not collect ambiguous legacy groups');
assert(!src.includes('Có \'+incomingStats.extraSignals+\' thông báo Agribank'),
 'no replay warning in main customer-facing review queue');
assert(!src.includes('Tiền NH theo nhóm · cần soát trùng'),
 'replay alert no longer causes a fake warning KPI');
assert(src.includes('Giao dịch Agribank (đã lọc trùng)'));
const sql=fs.readFileSync(path.join(root,
 'supabase/migrations/20261112211500_bank309_bank_proof_fields_and_nextday_ack.sql'),'utf8');
assert.match(sql,/bank_balance_text/);
assert.match(sql,/bank_memo/);
assert.match(sql,/n\.fingerprint,n\.received_at/);
assert.match(sql,/r\.reason AS receipt_reason/);
assert.match(sql,/agribank_plus_credit_missing_bill_hour_next_day/);
assert.match(sql,/Đã thu bù: bill thiếu giờ giao dịch nên hệ thống đợi sang ngày mới/);
assert.match(sql,/Đã đối soát Agribank · Sổ/);
assert.match(sql,/chat_bank_auto_collection_ack_drain\(integer\)/);
assert(!/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(?:taphoa_debt_ledger|taphoa_agribank_notifications)/i.test(sql));
assert(/đã đối soát Agribank/i.test(sql),'receipt message retains official bank evidence');
console.log('BANK-309: 11→8 bank events, independent proof fields, no warning and delayed ACK contract PASS');
