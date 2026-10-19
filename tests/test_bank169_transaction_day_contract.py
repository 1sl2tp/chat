"""BANK-169: transaction date/amount joins and internal transfers protected."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EDGE=(ROOT/"supabase/functions/v21-bank-bill-event/index.ts").read_text(encoding="utf-8")
PREVIEW=(ROOT/"supabase/functions/v21-bank-bill-event/bill-app-preview.mjs").read_text(encoding="utf-8")
M=(ROOT/"supabase/migrations")
PARSER=(M/"20261019111500_bank169_printed_bank_time_helper.sql").read_text(encoding="utf-8")
INDEX=(M/"20261019111700_bank169_day_index_and_own_transfer.sql").read_text(encoding="utf-8")
WAKE=(M/"20261019112500_bank169_wake_by_bank_transaction_time.sql").read_text(encoding="utf-8")
WRITER=(M/"20261019113000_bank169_final_posted_vs_transaction_time.sql").read_text(encoding="utf-8")
QUEUE=(M/"20261019113500_bank169_scan_images_without_bank_push.sql").read_text(encoding="utf-8")
def test_notification_stores_original_transaction_and_self_transfer_independently():
 assert "chat_agribank_transfer_at" in PARSER
 assert "generated always as (public.chat_agribank_transfer_at(body)) stored" in INDEX
 assert "generated always as (public.chat_agribank_own_transfer(body)) stored" in INDEX
 assert "BUI[[:space:]]+XUAN[[:space:]]+TUNG" in INDEX
 assert "taphoa_agribank_credit_transaction_idx" in INDEX
def test_bill_ocr_happens_on_upload_even_if_no_bank_notification():
 assert "Classify bill from its pixels even when the bank notification arrives later" in EDGE
 assert "no_recent_credit_sms_or_agribank_app_notification" not in EDGE
 assert "eligibleAppEvents" not in EDGE
 assert "waiting_for_bank_transaction_match" in QUEUE
 assert "chat_bank_bill_queue_amount_image()" in QUEUE
def test_match_by_transaction_not_Android_or_chat_arrival():
 assert EDGE.count('.gte("transfer_at",lo.toISOString())')==2
 assert EDGE.count('.lte("transfer_at",hi.toISOString())')==2
 assert 'eq("is_own_transfer",false)' in EDGE
 assert "def:=replace(def,from_text,to_text)" in WRITER
 assert "o.transfer_at between n.transfer_at" in WRITER
 assert "n.is_own_transfer=true" in WRITER
 assert "r.sent_at<now()" in WRITER
 assert "v_transaction_at" in WAKE
 assert "new.is_own_transfer=true" in WAKE
 assert "r.transfer_at_vn between" in WAKE
 assert "r.sent_at between v_transaction_at" not in WAKE
 assert "and r.created_at>=now()" not in WAKE
 assert "to_text:='and o.transfer_at between n.transfer_at" in WRITER
 assert "now-sent>36*" not in PREVIEW
 assert "when(e.posted_at)<=sent+" not in PREVIEW
 assert "!ownTransferNotice(e)" in PREVIEW
def test_preserve_atomic_idempotent_accounting():
 assert 'db.rpc("chat_bank_app_collect"' in EDGE
 assert 'matchPreview?.status==="candidate_unique"' in EDGE
 assert "n.is_own_transfer=true or n.transfer_at is null" in WRITER
 assert "taphoa_chat_notify_customer" not in EDGE
