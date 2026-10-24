"""BANK-212: Financial auto-collection must retry safely, never invent proof."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (ROOT / "supabase/migrations/20261024170000_bank212_bounded_verified_collection_retry.sql").read_text("utf-8")
PREVIEW = (ROOT / "supabase/functions/v21-bank-bill-event/bill-app-preview.mjs").read_text("utf-8")
VISION = (ROOT / "supabase/functions/v21-bank-bill-event/bill-amount-rules.mjs").read_text("utf-8")


def test_retries_use_original_atomic_financial_guard():
    for required in (
        "public.chat_bank_app_collect(x.media_asset_id,x.notification_id)",
        "r.status='amount_read' AND r.ledger_id IS NULL",
        "'candidate_unique'",
        "'agribank_plus_notification'",
        "AND r.transfer_at_vn::date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date",
        "a.outcome='retry'",
        "a.attempt_count<3",
        "WHERE id=x.receipt_id AND status='amount_read' AND ledger_id IS NULL",
        "pg_try_advisory_xact_lock(17812094)",
        "chat_bank_auto_collect_attempts",
        "taphoa-bank-verified-collect-retry-v1",
        "REVOKE ALL ON FUNCTION public.chat_bank_auto_collect_retry(integer)",
    ):
        assert required in MIGRATION, required


def test_minute_match_and_manual_review_for_ambiguous_evidence():
    assert "abs(extract(epoch from(image_at-transaction_at)))>60" in MIGRATION
    assert "Math.abs(bankEventTime(e)-date)<=60000" in PREVIEW
    assert "bank_time_outside_one_minute" in PREVIEW
    assert 'multiple_matching_agribank_notifications' in PREVIEW
    assert "reference_and_memo_verified_waiting_financial_guard" in PREVIEW
    assert "Financial writer does not yet authorize a missing printed clock." in PREVIEW


def test_ocr_does_not_confuse_sender_and_recipient_banks():
    assert "sending_bank=VPBANK" in VISION
    assert "receiving_bank=AGRIBANK" in VISION
    assert "receiving_bank=null" in VISION
