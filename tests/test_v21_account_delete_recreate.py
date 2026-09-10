from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "supabase/functions/v21-account-admin/index.ts"
REGISTER = ROOT / "supabase/functions/v21-register/index.ts"
MIGRATIONS = ROOT / "supabase/migrations"
CONVERSATION_PATCH = MIGRATIONS / "20260910190000_v21_hard_delete_user_conversation_cleanup.sql"


class AccountDeleteRecreateContract(unittest.TestCase):
    def admin_text(self):
        self.assertTrue(ADMIN.exists(), "v21-account-admin edge function must exist")
        return ADMIN.read_text(encoding="utf-8")

    def register_text(self):
        self.assertTrue(REGISTER.exists(), "v21-register edge function source must be versioned")
        return REGISTER.read_text(encoding="utf-8")

    def migration_text(self):
        self.assertTrue(MIGRATIONS.exists(), "supabase/migrations directory must exist")
        return "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted(MIGRATIONS.glob("*.sql"))
        ).lower()

    def test_auth_delete_trigger_cleans_restricting_user_data_before_account_cascade(self):
        text = self.migration_text()
        self.assertIn("create or replace function v21_private.v21_hard_delete_user_cleanup", text)
        self.assertIn("before delete on auth.users", text)
        self.assertIn("delete from public.getlink_debt_ledger", text)
        self.assertIn("delete from public.getlink_sales_orders", text)
        self.assertIn("delete from public.debts", text)
        self.assertIn("delete from public.order_items", text)
        self.assertIn("delete from public.orders", text)
        self.assertIn("delete from public.v21_calls", text)

    def test_hard_delete_removes_calls_then_conversation_before_account_fk_actions(self):
        self.assertTrue(CONVERSATION_PATCH.exists(), "reply-safe hard-delete patch must exist")
        text = CONVERSATION_PATCH.read_text(encoding="utf-8").lower()
        calls_pos = text.index("delete from public.v21_calls")
        conversations_pos = text.index("delete from public.v21_conversations")
        self.assertLess(calls_pos, conversations_pos)
        self.assertIn("member_a = v_account_id or member_b = v_account_id", text)

    def test_admin_delete_removes_storage_revokes_session_then_hard_deletes_auth_user(self):
        text = self.admin_text()
        self.assertIn("admin.storage.from(bucket).remove", text)
        self.assertIn('removeStoragePaths("v21-media"', text)
        self.assertIn('removeStoragePaths("v21-avatars"', text)
        self.assertIn("storage_delete_failed", text)

        delete_block = text[text.index('action === "delete"'):]
        storage_pos = delete_block.index("await removeTargetStorage()")
        revoke_pos = delete_block.index("await revokeTargetSessions()")
        auth_delete_pos = delete_block.index("admin.auth.admin.deleteUser(target.auth_user_id)")
        self.assertLess(storage_pos, auth_delete_pos)
        self.assertLess(revoke_pos, auth_delete_pos)
        self.assertIn("auth_delete_failed", delete_block)
        self.assertNotIn("deleted_at: now", delete_block)

    def test_registration_creates_fresh_identity_and_only_checks_live_username(self):
        text = self.register_text()
        self.assertIn('.is("deleted_at", null)', text)
        self.assertIn("admin.auth.admin.createUser", text)
        self.assertIn("auth_user_id: created.user.id", text)
        self.assertNotIn("restore", text.lower())
        self.assertNotIn("undelete", text.lower())


if __name__ == "__main__":
    unittest.main()
