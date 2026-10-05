from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261005113816_terminalize_stale_zalo_outbound.sql"


def test_stale_cutover_rows_are_terminal_and_not_retryable():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "expired_cutover_terminal" in sql
    assert "attempt_count=greatest(attempt_count,5)" in sql
    assert "expired_cutover_pending" in sql


def test_outbound_due_rejects_payloadless_deliveries():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "delivery_part='text'" in sql
    assert "btrim(coalesce(m.body,''))<>''" in sql
    assert "delivery_part='media'" in sql
    assert "exists(" in sql
    assert "a.kind in ('image','audio','file')" in sql


def test_outbound_due_stays_service_role_only():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "revoke all on function public.v21_zalo_outbound_due_media(integer) from public,anon,authenticated" in sql
    assert "grant execute on function public.v21_zalo_outbound_due_media(integer) to service_role" in sql
