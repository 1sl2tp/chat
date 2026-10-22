from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
edge=(ROOT/'supabase/functions/v21-bank-bill-event/index.ts').read_text('utf-8')
retry=(ROOT/'supabase/migrations/20261022213000_bank186_no_lost_bill_scan_and_admin_alert.sql').read_text('utf-8')
alerts=(ROOT/'supabase/migrations/20261022214500_bank187_distinct_ai_alert_stages.sql').read_text('utf-8')
push=(ROOT/'supabase/functions/v21-admin-push/index.ts').read_text('utf-8')
push_core=(ROOT/'supabase/functions/v21-admin-push/push-core.mjs').read_text('utf-8')
dashboard=(ROOT/'bank-report-dashboard.js').read_text('utf-8')
assert "scan_started_at:new Date().toISOString()" in edge
assert "scan_started_at:null" in edge
assert "tries>=1&&tries<6" in edge
assert "retryMinutes*60000" in edge
assert "sent>=Date.now()-7*86400000" in edge
assert 'retryable?"failed":"review"' in edge
assert 'amount_scan_' in edge and 'gemini_http_' in edge
assert 'chat_bank_app_collect' in edge
assert 'status==="amount_read"&&matchPreview?.source==="agribank_plus_notification"' in edge
assert "scan_started_at timestamptz" in retry
assert "r.status='scanning'" in retry and "interval '4 minutes'" in retry
assert "r.status='queued'" in retry and "interval '3 minutes'" in retry
assert "r.attempt_count between 1 and 5" in retry
assert "when r.attempt_count=1 then 3" in retry
assert "when r.attempt_count=2 then 10" in retry
assert "when r.attempt_count=3 then 30" in retry
assert "when r.attempt_count=4 then 60" in retry
assert "status='review'" in retry
assert "ai_scan_retry_exhausted" in retry
assert "ai_scan_old_unresolved" in retry
assert "ai_scan_queue_expired_no_result" in retry
assert "r.ledger_id is null" in retry
assert "m.deleted_at is null and m.kind='image'" in retry
assert "msg.deleted_at is null and msg.sender_account_id=r.customer_account_id" in retry
assert "'x-internal-dispatch-key',v_key" in retry
# A read-only lookup for existing receipt links is allowed in Admin alerts.
# Neither the retry queue nor its notifications may write collection links/ledger.
assert "insert into public.chat_bank_app_collection_links" not in retry.lower()
assert "insert into public.taphoa_debt_ledger" not in retry.lower()
assert "chat_bank_app_collect(" not in retry
assert "new.status not in ('amount_read','review','duplicate','failed')" in alerts
assert "'review:ai-retrying:'" in alerts and "'review:ai-attention:'" in alerts
assert "p_kind='review' and p_day<v_today-7" in retry
assert '["review","duplicate","amount_read","failed"]' in push
assert "bankScanReasonLabel" in push_core
for reason in ("gemini_key_missing","gemini_http_429","ai_scan_retry_exhausted"):
    assert reason in push_core
assert "Ảnh AI chưa kết luận" in dashboard
assert "isAiScanIssue(row)" in dashboard
print('BANK-186/187 no-lost-image retry, API escalation, reporting and push safeguards PASS')
