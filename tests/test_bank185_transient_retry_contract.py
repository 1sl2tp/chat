from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
edge=(ROOT/'supabase/functions/v21-bank-bill-event/index.ts').read_text('utf-8')
sql=(ROOT/'supabase/migrations/20261022210500_bank185_transient_bill_scan_retry.sql').read_text('utf-8')
assert 'select("id,status,reason,scanned_at,customer_account_id,sent_at,attempt_count")' in edge
assert 'job.status==="failed"&&transientError' in edge
assert 'tries>=1&&tries<6' in edge
assert 'Date.now()-inspected>=retryMinutes*60000' in edge
assert 'sent>=Date.now()-7*86400000' in edge
assert '.eq("status",retryFailed?"failed":"queued").eq("attempt_count",job.attempt_count||0)' in edge
assert 'const timeout=setTimeout(()=>ctl.abort(),30000);' in edge
assert 'chat_bank_app_collect' in edge
assert 'status==="amount_read"&&matchPreview?.source==="agribank_plus_notification"' in edge
assert 'create or replace function v21_private.chat_bank_retry_transient_scan_failures()' in sql
assert 'security definer' in sql and 'revoke all on function' in sql
assert "r.attempt_count between 1 and 2" in sql
assert "r.status='failed' and r.ledger_id is null" in sql
assert "r.scanned_at <= now()-interval '2 minutes'" in sql
assert "m.deleted_at is null and m.kind='image'" in sql
assert "n.status='credit_candidate' and n.amount_vnd>0" in sql
assert "n.bank_credit_account='2901181999999'" in sql
assert "n.is_own_transfer=false" in sql
assert "limit 10" in sql and "'*/5 * * * *'" in sql
assert "'x-internal-dispatch-key',v_key" in sql
assert "chat_bank_app_collect" not in sql
print('BANK-185 bounded retry, guarded bank evidence and no direct collection PASS')
