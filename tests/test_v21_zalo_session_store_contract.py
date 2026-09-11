from pathlib import Path

PATH = Path(__file__).parents[1] / "supabase/migrations/20260911_zalo_session_store.sql"


def test_zalo_session_store_is_private_and_bridge_authenticated():
    assert PATH.exists(), "missing Zalo session-store migration"
    sql = PATH.read_text("utf-8").lower()
    required = [
        "create table if not exists public.v21_zalo_bridge_auth",
        "create table if not exists public.v21_zalo_bridge_session",
        "token_sha256",
        "credentials jsonb",
        "enable row level security",
        "revoke all on table public.v21_zalo_bridge_auth from anon, authenticated",
        "revoke all on table public.v21_zalo_bridge_session from anon, authenticated",
        "grant select on table public.v21_zalo_bridge_auth to service_role",
        "grant select, insert, update on table public.v21_zalo_bridge_session to service_role",
    ]
    for token in required:
        assert token in sql, token
