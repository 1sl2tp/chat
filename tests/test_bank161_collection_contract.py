"""Safety contract for BANK-161; never posts real money or writes Production data."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIG = (ROOT / "supabase/migrations/20261019101000_bank_auto_collect_commit.sql").read_text(encoding="utf8").lower()

def test_sms_and_bill_are_both_required_and_toggle_is_enforced():
    assert "chat_auto_collect_settings where singleton=true for update" in MIG
    assert "v_settings.enabled and v_settings.ready" in MIG
    assert "where media_asset_id=p_asset_id for update" in MIG
    assert "where id=p_sms_id for update" in MIG
    assert "match_preview,status" in MIG
    assert "candidate_unique" in MIG

def test_one_bank_sms_or_receipt_can_only_be_used_once():
    assert "sms_id bigint not null unique" in MIG
    assert "receipt_id uuid primary key" in MIG
    assert "command_id uuid not null unique" in MIG
    assert "pg_advisory_xact_lock" in MIG

def test_existing_taphoa_thousand_dong_accounting_contract():
    assert "v_units:=v_amount/1000" in MIG
    assert "mod(v_amount,1000)<>0" in MIG
    assert "taphoa_debt_ledger" in MIG
    assert "taphoa_bump_revision('debt')" in MIG
    assert "taphoa_chat_customer_balance_value" in MIG
    assert "taphoa_chat_notify_customer" in MIG
    assert "taphoa_command_log" in MIG

def test_not_exposed_to_anonymous_or_authenticated_clients():
    assert "revoke all on function public.chat_bank_auto_collect_commit(uuid,bigint) from public,anon,authenticated" in MIG
    assert "grant execute on function public.chat_bank_auto_collect_commit(uuid,bigint) to service_role" in MIG
