from pathlib import Path
root=Path(__file__).resolve().parents[1]
repair=(root/'supabase/migrations/20261024040500_bank189_verified_ocr_year_mismatch.sql').read_text()
path_fix=(root/'supabase/migrations/20261024042500_bank189_ocr_unaccent_search_path.sql').read_text()
wake=(root/'supabase/migrations/20261024043000_bank190_bidirectional_year_wake.sql').read_text()
ui=(root/'bank-report-dashboard.js').read_text()
assert 'create table if not exists public.chat_bank_ocr_year_evidence' in repair
assert 'original_read jsonb not null' in repair
assert 'notification_id bigint not null unique' in repair
assert 'receipt_id uuid not null unique' in repair
assert 'public.chat_bank_app_collect(r.media_asset_id,n.id)' in repair
assert "bank_local::date<>(now() at time zone 'Asia/Ho_Chi_Minh')::date" in repair
assert "'prior_day_review'" in repair and "'ledger_written',false" in repair
assert "r.transfer_at_vn,'MM-DD HH24:MI'" in repair
assert "'bank_printed_data_conflict'" in repair
assert "'memo_or_recipient_conflict'" in repair
assert "'multiple_possible_matches'" in repair
assert "'evidence_not_eligible'" not in repair
assert 'revoke all on function public.chat_bank_reconcile_ocr_year' in repair
assert 'grant execute on function public.chat_bank_reconcile_ocr_year' in repair
assert "to service_role;" in repair
assert 'public,v21_private,extensions,pg_temp' in path_fix
assert 'after insert on public.taphoa_agribank_notifications' in wake
assert 'after update of status on public.chat_bank_bill_receipts' in wake
assert wake.count('public.chat_bank_reconcile_ocr_year(')==2
assert 'r.sent_at between new.transfer_at' in wake
assert 'n.transfer_at between new.sent_at' in wake
assert 'ai_year_error_' in ui
assert 'Agribank đã xác nhận' in ui
print('BANK-189/190 year-only evidence, uniqueness, audit, guarded posting and automatic wake PASS')
