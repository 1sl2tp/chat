"""BANK-159: event-driven AI budget and fail-closed financial invariants."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"supabase/migrations/20261018172000_chat_bank_bill_sms_gated_ai.sql").read_text(encoding="utf-8")
EDGE=(ROOT/"supabase/functions/v21-bank-bill-event/index.ts").read_text(encoding="utf-8")
PREVIEW=(ROOT/"supabase/functions/v21-bank-bill-event/bill-sms-preview.mjs").read_text(encoding="utf-8")

def test_only_sms_opens_bill_scan_dispatch():
    assert "waiting_for_banking_sms" in SQL
    assert "if not exists(" in SQL
    assert "public.taphoa_sms_inbox s" in SQL
    assert "then return new; end if;" in SQL
    assert "after insert on public.taphoa_sms_inbox" in SQL.lower()
    assert "r.status='queued'" in SQL
    assert "limit 6" in SQL.lower()
    assert "interval '24 hours'" in SQL
    assert "interval '10 minutes'" in SQL
    assert "net.http_post" in SQL

def test_bill_is_classified_before_bank_notification_but_never_posts_without_match():
    # BANK-169: user requested bill-by-date cataloguing independent of OTT delivery.
    assert "Process and classify every recent customer image independently" in EDGE or "Classify bill from its pixels even when the bank notification arrives later" in EDGE
    assert "eligibleSms.length===0" not in EDGE
    assert "bank_sms_preflight_unavailable" not in EDGE
    assert "waiting_bank_event" not in EDGE
    assert "previewBillAppMatch" in EDGE
    assert 'db.rpc("chat_bank_app_collect"' in EDGE
    assert 'matchPreview?.status==="candidate_unique"' in EDGE
    assert "ledger_written:false" in EDGE
    assert EDGE.index('db.storage.from("v21-media").download')<EDGE.index('generativelanguage.googleapis.com')


def test_no_db_debt_mutations_or_background_polling():
    text=SQL.lower()+EDGE.lower()
    assert "insert into public.taphoa_debt_ledger" not in text
    assert "update public.taphoa_debt_ledger" not in text
    assert "cron.schedule" not in text
    assert "setinterval" not in text
    assert "daily_scan_limit_no_collection" in EDGE

def test_sms_parser_accepts_vietnamese_yearless_time_without_ai():
    assert "bankSmsTimeWithoutYear" in PREVIEW
    assert 'timeZone:"Asia/Ho_Chi_Minh"' in PREVIEW
    assert "transactionText=msg.split" in PREVIEW
