"""BANK-164: safety and regressions for app notification-backed auto collection."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"supabase/migrations/20261019094500_bank164_app_collection_atomic.sql").read_text(encoding="utf-8").lower()
EDGE=(ROOT/"supabase/functions/v21-bank-bill-event/index.ts").read_text(encoding="utf-8")
PREVIEW=(ROOT/"supabase/functions/v21-bank-bill-event/bill-app-preview.mjs").read_text(encoding="utf-8")
UI=(ROOT/"zalo-admin-link.js").read_text(encoding="utf-8")
def test_receipt_bank_event_and_settings_all_required():
 assert "config.enabled and config.ready" in SQL
 assert "from public.taphoa_agribank_notifications where id=p_notification_id for update" in SQL
 assert "where media_asset_id=p_asset_id for update" in SQL
 assert "agribank_plus_notification" in SQL
 assert "candidate_unique" in SQL
 assert "credit_candidate" in SQL
 assert "bank_bill_amount_v4_20261018" in SQL
 assert "notification_id bigint not null unique" in SQL
 assert "receipt_id uuid primary key" in SQL
 assert "pg_advisory_xact_lock(17812026)" in SQL
 assert "possible_manual_collection" in SQL
def test_taphoa_accounting_same_units_and_message():
 assert "mod(transfer_amount,1000)<>0" in SQL
 assert "thousands:=transfer_amount/1000" in SQL
 assert "insert into public.taphoa_debt_ledger" in SQL
 assert "'collection',-thousands" in SQL
 assert "taphoa_chat_customer_balance_value" in SQL
 assert "taphoa_bump_revision('debt')" in SQL
 assert "taphoa_chat_notify_customer" in SQL
 assert "insert into public.taphoa_command_log" in SQL
 assert "chuyển khoản tự động" in SQL
def test_internal_rpc_exclusive_and_response_truthful():
 assert "revoke all on function public.chat_bank_app_collect(uuid,bigint) from public,anon,authenticated" in SQL
 assert "grant execute on function public.chat_bank_app_collect(uuid,bigint) to service_role" in SQL
 assert 'db.rpc("chat_bank_app_collect"' in EDGE
 assert 'matchPreview?.source==="agribank_plus_notification"' in EDGE
 assert 'posted?.ok===true&&posted?.status==="received"' in EDGE
 assert 'ledger_written:true' in EDGE
 assert "if(now-sent<2*60000)" not in PREVIEW
def test_ui_is_about_bank_app_not_sms():
 assert "Tự động thu tiền qua Agribank Plus" in UI
 assert "thông báo tiền vào Agribank Plus" in UI
 assert "Chưa có SMS thì" not in UI
 assert "Chỉ thu khi SMS và bill" not in UI

def test_late_app_credit_rechecks_stored_bill_without_ai():
 trigger=(ROOT/"supabase/migrations/20261019095000_bank164_app_wake_read_receipts.sql").read_text(encoding="utf-8")
 assert "status='amount_read' and amount_vnd=new.amount_vnd" in trigger
 assert 'if(job.status==="amount_read")' in EDGE
 assert 'eq("status","amount_read")' in EDGE
 assert 'previewBillAppMatch({' in EDGE
 assert 'ai_called:false' in EDGE

def test_collection_cannot_post_silently_without_chat_permission():
 live=(ROOT/"supabase/migrations/20261019095500_bank164_respect_collection_notification.sql").read_text(encoding="utf-8")
 assert "v21_private.chat_outbound_allowed(customer" in live
 assert "collection_notification_disabled" in live
 assert live.index("collection_notification_disabled")<live.index("insert into public.taphoa_debt_ledger")
