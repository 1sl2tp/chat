"""BANK-170/171: exact bank credit account, optional cropped customer bill last five."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EDGE=(ROOT/"supabase/functions/v21-bank-bill-event/index.ts").read_text(encoding="utf-8")
PREVIEW=(ROOT/"supabase/functions/v21-bank-bill-event/bill-app-preview.mjs").read_text(encoding="utf-8")
ROOT_SQL=(ROOT/"supabase/migrations")
ACCOUNT=(ROOT_SQL/"20261019120500_bank170_bank_credit_account.sql").read_text(encoding="utf-8")
WRITER=(ROOT_SQL/"20261019123000_bank171_accept_bill_last_five.sql").read_text(encoding="utf-8")
WAKE=(ROOT_SQL/"20261019124000_bank170_wake_only_target_credit_account.sql").read_text(encoding="utf-8")

def test_each_notification_keeps_full_credited_account():
    assert "bank_credit_account" in ACCOUNT
    assert "Tài khoản" in ACCOUNT
    assert "generated always as" in ACCOUNT
    assert EDGE.count('eq("bank_credit_account","2901181999999")')==2
    assert "creditAccountFromEvent(e)===destination" in PREVIEW
    assert "new.bank_credit_account is distinct from '2901181999999'" in WAKE

def test_only_customer_bill_may_be_partly_masked():
    assert "regexp_replace(r.receiving_account,'[^0-9]','','g')" in WRITER
    assert "right(regexp_replace(r.receiving_account" in WRITER
    assert "right(account_number,5)" in WRITER
    assert "account_number<>''2901181999999''" in WRITER
    assert "recipient_account_conflict" in WRITER
    assert "acct.endsWith(destination.slice(-5))" in PREVIEW
    assert "recipient_account_conflict" in PREVIEW

def test_bank_credit_and_financial_safety_unchanged():
    assert ".eq(\"is_own_transfer\",false)" in EDGE
    assert "duplicate_or_ambiguous" not in WRITER or "original" in WRITER
    assert "function public.chat_bank_app_collect" in WRITER
    assert 'db.rpc("chat_bank_app_collect"' in EDGE
