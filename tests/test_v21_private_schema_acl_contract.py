from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261005120410_harden_private_schema_function_acl.sql"


def test_private_schemas_are_default_deny():
    sql = MIGRATION.read_text("utf-8").lower()
    for schema in ("chat_private","v21_private","v21_storage_private","business_private"):
        assert f"revoke execute on all functions in schema {schema} from public, anon, authenticated" in sql


def test_legacy_and_policy_helpers_are_explicit_allowlist():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "grant execute on function chat_private.get_my_chat_list(uuid) to anon, authenticated" in sql
    assert "grant execute on function chat_private.is_current_conversation_member(uuid) to authenticated" in sql
    assert "grant execute on function v21_private.v21_call_get(uuid,uuid) to authenticated" in sql
    assert "grant execute on function v21_private.can_access_conversation(uuid) to authenticated" in sql
    assert "grant execute on function v21_storage_private.can_read(text) to authenticated" in sql
    assert "grant execute on function v21_storage_private.can_upload(text) to authenticated" in sql


def test_v21_private_has_no_anon_allowlist():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "grant usage on schema v21_private to authenticated, service_role" in sql
    assert "grant usage on schema v21_private to anon" not in sql
