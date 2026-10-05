from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261005121903_optimize_chat_call_invites_rls.sql"


def test_call_invite_creator_policy_uses_auth_initplan():
    sql = MIGRATION.read_text("utf-8").lower()
    assert "alter policy chat_call_invites_creator_select" in sql
    assert "(select auth.uid()) = created_by_account_id" in sql
    assert "using (auth.uid() = created_by_account_id)" not in sql
