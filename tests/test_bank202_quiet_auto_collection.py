"""BANK-202: Auto-collection is ledger-first, not Chat-spam-first."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"supabase/migrations/20261024103500_bank202_quiet_automatic_collections.sql").read_text("utf-8")
OLD=(ROOT/"supabase/migrations/20261019095500_bank164_respect_collection_notification.sql").read_text("utf-8")
MANUAL=(ROOT/"supabase/migrations/20261024051000_bank191_admin_manual_agribank_collection.sql").read_text("utf-8")

def test_quiet_auto_collection_preserves_verified_accounting():
    for token in (
        "pg_advisory_xact_lock(17812026)",
        "already_manual_collected",
        "possible_manual_collection",
        "duplicate_or_ambiguous",
        "insert into public.taphoa_command_log",
        "insert into public.chat_bank_app_collection_links",
        "insert into public.taphoa_debt_ledger",
    ):
        assert token in SQL, token
    assert "BANK-202: ledger-only auto collection" in SQL
    assert "message_id:=null;" in SQL
    assert "collection_notification_disabled" in SQL  # Replaces old gate
    assert "fn:=replace(fn,old_gate," in SQL
    assert "fn:=replace(fn,old_send," in SQL
    assert "notice_sent" in OLD  # The return remains backward compatible

def test_manual_collect_is_not_silenced():
    assert "taphoa_chat_notify_customer" in MANUAL
    assert "p_existing_ledger_id" in MANUAL
    assert "possible_manual_collection" in MANUAL

def test_stop_only_new_automatic_messages_not_historical_data():
    assert "delete from public.v21_messages" not in SQL.lower()
    assert "update public.taphoa_debt_ledger" not in SQL.lower()
    assert "delete from public.taphoa_debt_ledger" not in SQL.lower()
    assert "chat_auto_collect_settings" not in SQL.lower()
    assert "from public.chat_bank_app_collect" not in SQL.lower()
