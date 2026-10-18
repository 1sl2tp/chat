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

def test_ai_is_impossible_without_valid_sms():
    assert "bank_sms_preflight_unavailable" in EDGE
    assert "eligibleSms.length===0" in EDGE
    assert "no_valid_recent_incoming_bank_sms" in EDGE
    assert "ledger_written:false" in EDGE
    # Gate MUST be before binary downloads, hash reservation and Gemini call.
    gate=EDGE.index("const eligibleSms=bankSmsRows.map")
    no_sms=EDGE.index("if(eligibleSms.length===0)")
    download=EDGE.index('db.storage.from("v21-media").download')
    ai=EDGE.index('generativelanguage.googleapis.com')
    assert gate < no_sms < download < ai
    assert "readIncomingAgribankSms" in EDGE
    assert "return response({ok:true,status:\"waiting_sms\"" in EDGE

def test_no_db_debt_mutations_or_background_polling():
    text=SQL.lower()+EDGE.lower()
    assert "insert into public.taphoa_debt_ledger" not in text
    assert "update public.taphoa_debt_ledger" not in text
    assert "cron.schedule" not in text
    assert "setinterval" not in text
    assert "24*3600000" in EDGE

def test_sms_parser_accepts_vietnamese_yearless_time_without_ai():
    assert "bankSmsTimeWithoutYear" in PREVIEW
    assert 'timeZone:"Asia/Ho_Chi_Minh"' in PREVIEW
    assert "transactionText=msg.split" in PREVIEW
