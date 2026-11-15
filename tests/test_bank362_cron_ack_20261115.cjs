'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'../docs/proposed-sql/BANK_362_immediate_retry_ack_NOT_APPLIED.sql'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261115125154_bank362_immediate_verified_collection_ack.sql'),'utf8');
const normalize=source=>source.replace(/--[^\n]*/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const norm=normalize(sql);
assert.equal(normalize(migration),norm,'versioned migration must match the verified SQL proposal');
assert.match(migration,/BANK-362: versioned migration/, 'migration may promote the proposal');

assert.match(sql,/ARCHIVED PROPOSAL/, 'staged SQL is archived, live code is the versioned migration');
assert.match(norm,/v_collect := public\.chat_bank_auto_collect_retry\(20\)/, 'reuse the only guarded financial retry writer');
assert.match(norm,/if v_collect->>'ok' = 'true'\s+and coalesce\(\(v_collect->>'received'\)::integer, 0\) > 0/, 'only post ACK on verified ledger success');
assert.match(norm,/v_ack := public\.chat_bank_auto_collection_ack_drain\(30\)/, 'reuse audited opt-in and idempotent ACK pipeline');
assert.match(norm,/exception when others then/, 'ACK error must be caught without blocking ledger');
assert.match(norm,/revoke all on function v21_private\.bank362_retry_collect_and_ack\(\)/, 'private wrapper must not be exposed');
assert.match(norm,/cron\.alter_job\(/, 'edit the same cron job rather than creating another');
assert.match(norm,/job_id => j\.jobid/, 'preserve stable retry job ID');
assert.match(norm,/bank362_ack_fallback_cron_missing/, 'independent 2-minute ACK cron remains');
assert.match(norm,/bank362_financial_retry_cron_contract_changed/, 'fail closed on unexpected production code');
assert.doesNotMatch(norm,/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?(public\.)?taphoa_debt_ledger\b/, 'proposal must not alter the money ledger');
assert.doesNotMatch(norm,/cron\.schedule\s*\(/, 'no extra scheduled job');
assert.doesNotMatch(norm,/\bgrant\s+execute\b/, 'no new public SQL privilege');
console.log('BANK-362: guarded cron retry publishes same-transaction ACK; fallback preserved — PASS');
