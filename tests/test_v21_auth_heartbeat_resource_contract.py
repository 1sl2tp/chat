from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261005155241_throttle_auth_heartbeat_and_lock_anon.sql"
AUTH_STORE = ROOT / "auth-session-store.js"


def test_heartbeat_keeps_fast_auth_check_but_throttles_database_writes():
    sql = MIGRATION.read_text("utf-8").lower()
    js = AUTH_STORE.read_text("utf-8")
    assert "last_seen_at < now()-interval '5 minutes'" in sql
    assert sql.count("last_seen_at < now()-interval '5 minutes'") == 2
    assert "const HEARTBEAT_MS=60000" in js
    assert "document.visibilityState==='hidden'" in js


def test_heartbeat_is_not_anonymous_rpc():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "revoke execute on function public.v21_auth_heartbeat(uuid) from public, anon" in sql
    assert "grant execute on function public.v21_auth_heartbeat(uuid) to authenticated, service_role" in sql
