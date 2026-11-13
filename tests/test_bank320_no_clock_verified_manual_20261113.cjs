'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const migration=fs.readFileSync('supabase/migrations/20261113010500_bank320_no_clock_verified_manual.sql','utf8');
const bank310=fs.readFileSync('supabase/migrations/20261112220000_bank310_manual_bill_collection_late_credit_guard.sql','utf8');
assert(migration.includes('v21_private.bank320_unique_credit_for_no_clock'));
assert(migration.includes('bill_printed_time_missing'));
assert(migration.includes("n.package_name='com.vnpay.Agribank3g'"));
assert(migration.includes("n.is_own_transfer=false"));
assert(migration.includes('n.amount_vnd=r.amount_vnd'));
assert(migration.includes('n.bank_credit_account=r.receiving_account'));
assert(migration.includes("transfer_date_vn"));
assert(migration.includes("Nội dung giao dịch:"));
assert(migration.includes('count(DISTINCT n.fingerprint)'));
assert(migration.includes('v_fingerprints<>1'));
assert(migration.includes('bank_credit_already_collected'));
assert(migration.includes('bank320_prepare_patch'));
assert(migration.includes('v_effective_time:=v_receipt.transfer_at_vn;'));
assert(migration.includes('v_bank_proof:=v21_private.bank320_unique_credit_for_no_clock(v_receipt.id);'));
assert(migration.includes('bank_fingerprint_already_collected'));
assert(migration.includes('SELECT * INTO v_existing FROM public.chat_bank_manual_collections'));
assert(migration.includes('image_at:=r.transfer_at_vn at time zone'));
assert(migration.includes("v_effective_time:=v_r.transfer_at_vn;"));
assert(migration.includes("v_effective_time:=(v_bank_proof->>'bank_time_vn')::timestamp;"));
assert(migration.includes('INSERT INTO public.chat_bank_manual_collections'));
assert(migration.includes('INSERT INTO public.chat_bank_bill_manual_collections'));
assert(!/SET\s+transfer_at_vn\s*=/i.test(migration),
 'never fill a missing receipt clock using the separate bank clock');
assert(!/INSERT\s+INTO\s+public\.taphoa_debt_ledger/i.test(migration),
 'existing reviewed financial collector must remain the only ledger writer');
assert(bank310.includes('IF v_r.status NOT IN'));
assert(bank310.includes('INSERT INTO public.chat_bank_bill_manual_collections'));
assert(bank310.includes('v_notice_text text;'));
assert(bank310.includes('v_r.transfer_at_vn'));
assert(!migration.includes('DROP TABLE'));
const matching=(notice,bill)=>notice.bank==='Agribank'
 && notice.account===bill.account&&notice.amount===bill.amount
 && notice.date===bill.date && notice.memo===bill.memo
 && /^[0-9a-f]{64}$/.test(notice.fingerprint);
const bill={account:'2901181999999',amount:730000,date:'2026-11-12',
 memo:'LAIVANTANCHUYENTIEN'};
const source=(id,fp='f'.repeat(64))=>({
 id,bank:'Agribank',account:'2901181999999',amount:730000,
 date:'2026-11-12',memo:'LAIVANTANCHUYENTIEN',fingerprint:fp
});
const proof=notices=>{
 const valid=notices.filter(n=>matching(n,bill));
 const fps=new Set(valid.map(x=>x.fingerprint));
 return fps.size===1?{noticeId:Math.min(...valid.map(x=>x.id))}:null;
};
assert.equal(proof([source(274),source(280)]).noticeId,274);
assert.equal(proof([source(274),source(280,'e'.repeat(64))]),null);
assert.equal(proof([source(274),{...source(280),memo:'DIFFERENT'}]).noticeId,274,
 'unmatched bank memo never becomes authorized credit evidence');
assert.equal(proof([{...source(274),date:'2026-11-13'}]),null);
assert.equal(proof([{...source(274),amount:731000}]),null);
assert.equal(proof([{...source(274),account:'9999999999999'}]),null);
console.log('BANK-320: no-clock Admin-only bank proof, exact memo/date/amount/account, fingerprint replay and ledger separation PASS');));
assert(migration.includes('v_effective_time:=v_receipt.transfer_at_vn;'));
assert(migration.includes("v_bank_proof:=v21_private.bank320_unique_credit_for_no_clock(v_receipt.id);"));
assert(migration.includes('bank_fingerprint_already_collected'));
assert(migration.includes('SELECT * INTO v_existing FROM public.chat_bank_manual_collections'));
assert(migration.includes('image_at:=r.transfer_at_vn at time zone'));
assert(migration.includes("v_effective_time:=v_r.transfer_at_vn;"));
assert(migration.includes("v_effective_time:=(v_bank_proof->>'bank_time_vn')::timestamp;"));
assert(migration.includes('INSERT INTO public.chat_bank_manual_collections'));
assert(migration.includes('INSERT INTO public.chat_bank_bill_manual_collections'));
assert(!/SET\s+transfer_at_vn\s*=/i.test(migration),
 'never fill a missing receipt clock using the separate bank clock');
assert(!/INSERT\s+INTO\s+public\.taphoa_debt_ledger/i.test(migration),
 'existing reviewed financial collector must remain the only ledger writer');
assert(bank310.includes('IF v_r.status NOT IN'));
assert(bank310.includes('INSERT INTO public.chat_bank_bill_manual_collections'));
assert(bank310.includes('v_notice_text text;'));
assert(bank310.includes('v_r.transfer_at_vn'));
assert(!migration.includes('DROP TABLE'));
const matching=(notice,bill)=>notice.bank==='Agribank'
 && notice.account===bill.account&&notice.amount===bill.amount
 && notice.date===bill.date && notice.memo===bill.memo
 && /^[0-9a-f]{64}$/.test(notice.fingerprint);
const bill={account:'2901181999999',amount:730000,date:'2026-11-12',
 memo:'LAIVANTANCHUYENTIEN'};
const source=(id,fp='f'.repeat(64))=>({
 id,bank:'Agribank',account:'2901181999999',amount:730000,
 date:'2026-11-12',memo:'LAIVANTANCHUYENTIEN',fingerprint:fp
});
const proof=notices=>{
 const valid=notices.filter(n=>matching(n,bill));
 const fps=new Set(valid.map(x=>x.fingerprint));
 return fps.size===1?{noticeId:Math.min(...valid.map(x=>x.id))}:null;
};
assert.equal(proof([source(274),source(280)]).noticeId,274);
assert.equal(proof([source(274),source(280,'e'.repeat(64))]),null);
assert.equal(proof([source(274),{...source(280),memo:'DIFFERENT'}]).noticeId,274,
 'unmatched bank memo never becomes authorized credit evidence');
assert.equal(proof([{...source(274),date:'2026-11-13'}]),null);
assert.equal(proof([{...source(274),amount:731000}]),null);
assert.equal(proof([{...source(274),account:'9999999999999'}]),null);
console.log('BANK-320: no-clock Admin-only bank proof, exact memo/date/amount/account, fingerprint replay and ledger separation PASS');