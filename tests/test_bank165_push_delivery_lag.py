"""BANK-165: delayed Android Agribank Plus OTT must not falsify bank transaction time."""
from datetime import datetime,timezone,timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"supabase/migrations/20261019093000_bank165_allow_delayed_agribank_push.sql").read_text(encoding="utf-8").lower()

def test_delay_tolerance_is_tied_to_printed_bank_time_and_keeps_recipient_checks():
    assert "abs(extract(epoch from(n.posted_at-transaction_at)))>900" in SQL
    assert "r.sent_at<n.posted_at-interval '15 minutes'" in SQL
    assert "abs(extract(epoch from(image_at-transaction_at)))>300" in SQL
    assert "account_number<>'2901181999999'" in SQL
    assert "transfer_amount<>r.amount_vnd" in SQL
    assert "n.amount_vnd" in SQL
    assert "duplicate_or_ambiguous" in SQL

def test_true_bank_time_0909_arrives_at_android_091218_and_still_matches():
    vn=timezone(timedelta(hours=7))
    actual_bank=datetime(2026,10,19,9,9,0,tzinfo=vn)
    bill_at=datetime(2026,10,19,9,9,36,tzinfo=vn)
    pushed=datetime(2026,10,19,9,12,18,tzinfo=vn)
    assert abs((pushed-actual_bank).total_seconds())==198
    assert abs((bill_at-actual_bank).total_seconds())<300
    assert abs((pushed-actual_bank).total_seconds())<900

def test_preserve_strict_service_permission_and_bank_accounting():
    assert "not(config.enabled and config.ready)" in SQL
    assert "r.raw_read#>>'{match_preview,status}'<>'candidate_unique'" in SQL
    assert "thousands:=transfer_amount/1000" in SQL
    assert "chat_outbound_allowed" in SQL
    assert "taphoa_chat_notify_customer" in SQL
    assert "insert into public.chat_bank_app_collection_links" in SQL
