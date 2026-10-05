from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261005121608_remove_direct_chat_profiles_select.sql"


def test_authenticated_cannot_read_chat_profiles_table_directly():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "revoke select on table public.chat_profiles from authenticated" in sql


def test_profile_access_remains_rpc_owned():
    # The client should consume profile/account state through guarded RPCs,
    # not by selecting peer rows from chat_profiles.
    runtime_files = [
        ROOT / "auth-session-store.js",
        ROOT / "v21-realtime-session.js",
        ROOT / "v21-sync-engine.js",
        ROOT / "v21-message-store.js",
        ROOT / "conversation-core.js",
    ]
    text = "\n".join(path.read_text("utf-8") for path in runtime_files)
    assert ".from('chat_profiles')" not in text
    assert '.from("chat_profiles")' not in text
    assert "table:'chat_profiles'" not in text
    assert 'table:"chat_profiles"' not in text
