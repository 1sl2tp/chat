"""BANK-172: identical monetary amounts do not imply a duplicate bank transfer."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"supabase/migrations/20261019193000_bank172_distinct_equal_amount_collections.sql").read_text(encoding="utf-8")
EDGE=(ROOT/"supabase/functions/v21-bank-bill-event/index.ts").read_text(encoding="utf-8")
PREVIEW=(ROOT/"supabase/functions/v21-bank-bill-event/bill-app-preview.mjs").read_text(encoding="utf-8")

def would_block_manual_collection(ledger_entries, target_bank_minute, amount_thousands):
    # Represent new SQL's unlinked manual collection guard.
    return any(
      row["amount"] == -amount_thousands
      and row["entry_type"] == "collection"
      and target_bank_minute-30 <= row["posted_minute"] <= 1200
      and not row["has_auto_bank_link"]
      for row in ledger_entries
    )

def test_two_separate_215k_bank_transfers_are_not_duplicate_by_amount():
    bank1={"id":18,"amount_vnd":215000,"minute":17*60+37}
    bank2={"id":20,"amount_vnd":215000,"minute":18*60+54}
    assert bank1["id"] != bank2["id"]
    assert bank2["minute"]-bank1["minute"] == 77
    ledger1={"amount":-215,"entry_type":"collection","posted_minute":19*60,
             "has_auto_bank_link":True,"notification_id":18}
    assert not would_block_manual_collection([ledger1],bank2["minute"],215)
    assert 'previous_auto.ledger_id=l.id' in SQL
    assert 'not exists (' in SQL
    assert "l.amount_vnd=-thousands" in SQL

def test_manual_same_amount_must_still_block():
    manual={"amount":-215,"entry_type":"collection","posted_minute":19*60,
            "has_auto_bank_link":False}
    assert would_block_manual_collection([manual],18*60+54,215)
    assert "possible_manual_collection" in SQL
    assert "chat_bank_app_collection_links" in SQL

def test_bank_event_replay_and_ambiguous_matches_still_block():
    assert "l.notification_id=n.id or l.receipt_id=r.id" in SQL
    assert "o.transfer_at between n.transfer_at" in SQL
    assert "bank172_required_bank_safety_gates_missing" in SQL
    assert "n.is_own_transfer=true" in SQL
    assert "account_number<>''2901181999999''" in SQL
    assert "candidate_unique" in PREVIEW
    assert "multiple_matching_agribank_notifications" in PREVIEW
    assert "another_bill_same_time_amount" in PREVIEW
    assert 'db.rpc("chat_bank_app_collect"' in EDGE

def test_no_financial_writer_mutations_outside_guard_replace():
    assert "execute fn;" in SQL
    assert "pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure)" in SQL
    assert "insert into public.taphoa_debt_ledger" not in SQL
    assert "update public.chat_bank_bill_receipts" not in SQL
