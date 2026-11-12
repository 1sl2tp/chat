'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const edge=fs.readFileSync(path.join(root,
 'supabase/functions/v21-agribank-notification-ingest/index.ts'),'utf8');
const sql=fs.readFileSync(path.join(root,
 'supabase/migrations/20261112194000_bank306_global_agribank_dedupe_readonly_gap.sql'),'utf8');
const ui=fs.readFileSync(path.join(root,'bank-report-dashboard.js'),'utf8');

// Exact fingerprint, not amount/day: independent equal-amount transfers survive.
assert.match(edge,/fingerprint=eq\."[\s+]*row\.fingerprint/);
assert.match(edge,/global_duplicate_check_unavailable/);
assert.match(edge,/if\(!duplicateCheck\.ok\)return reply\(/);
assert.match(edge,/existing\.length>0\)return reply\(\{ok:true,stored:false,duplicate:true/);
const globalLookup=edge.indexOf('const duplicateCheck=await fetch');
const dbInsert=edge.indexOf('taphoa_agribank_notifications?on_conflict');
const waitUntil=edge.indexOf('EdgeRuntime.waitUntil(recheckNewCredit');
assert(globalLookup>=0&&dbInsert>globalLookup&&waitUntil>dbInsert,
 'duplicate lookup happens BEFORE insert and financial worker wake');

// The database is the atomic guard; no cleanup of historical ledger or notices.
assert.match(sql,/BEFORE INSERT ON public\.taphoa_agribank_notifications/);
assert.match(sql,/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(NEW\.fingerprint,306\)\)/);
assert.match(sql,/WHERE prior\.fingerprint=NEW\.fingerprint/);
assert.match(sql,/THEN RETURN NULL; END IF;/);
assert.doesNotMatch(sql,/\bDELETE\s+FROM\s+public\.taphoa_agribank_notifications/i);
assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?public\.taphoa_debt_ledger/i);

// Read-only admin functions canonicalize only exact event fingerprints.
// Prefer a historically linked record to preserve the real collection proof.
for(const name of ['chat_bank_all_credit_statuses','chat_bank_dashboard','chat_bank_report_snapshot'])
 assert(sql.includes(name),'must patch '+name);
assert.match(sql,/SELECT DISTINCT ON \(c\.fingerprint\) c\.\*/);
assert.match(sql,/chat_bank_app_collection_links l/);
assert.match(sql,/chat_bank_manual_collections m/);
assert.match(sql,/IF updated=prior THEN RAISE EXCEPTION/);

// A balance difference is NOT independently verified money.
assert.match(sql,/balance_after_vnd-p\.previous_balance_vnd-p\.amount_vnd/);
assert.match(sql,/balance_gap_needs_review/);
assert.match(sql,/false AS financial_authorized/);
assert.match(sql,/v21_private\.require_active_account\(p_app_session_id\)/);
assert.match(sql,/a\.role='admin'/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.chat_bank_missing_credit_candidates/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.chat_bank_missing_credit_candidates\(uuid,date\) TO authenticated/);

// Synthetic reproduction of the incident. The observed gap is mathematical
// context; never synthesize a bank notification or collection from the result.
const gap=(prevBalance,currentBalance,currentCredit)=>
 currentBalance-prevBalance-currentCredit;
assert.equal(gap(-126114730,-116092730,2022000),8000000);
assert.equal(gap(-116092730,-115629730,463000),0);
assert.equal(gap(-126114730,-116092730,10022000),0);
assert(gap(-126114730,-140000000,1000000)<0,
 'outgoing activity cannot be mistaken for a verified incoming credit');

// Missing RPC must not take down the existing bank dashboard.
assert.match(ui,/client\.rpc\('chat_bank_missing_credit_candidates'/);
assert.match(ui,/!gapReview\.error&&Array\.isArray\(gapReview\.data\)/);
assert.match(ui,/g\.financial_authorized===false/);
assert.match(ui,/chưa đủ căn cứ để tự thu/);
console.log('BANK-306 cross-device exact dedup, balance review and no-ledger-change contract PASS');
