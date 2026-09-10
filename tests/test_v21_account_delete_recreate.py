from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / "supabase/functions/v21-account-admin/index.ts"
REGISTER = ROOT / "supabase/functions/v21-register/index.ts"
MIGRATIONS = ROOT / "supabase/migrations"


class AccountDeleteRecreateContract(unittest.TestCase):
    def admin_text(self):
        self.assertTrue(ADMIN.exists(), "v21-account-admin edge function must exist")
        return ADMIN.read_text(encoding="utf-8")

    def register_text(self):
        self.assertTrue(REGISTER.exists(), "v21-register edge function must exist")
        return REGISTER.read_text(encoding="utf-8")

    def migration_text(self):
        self.assertTrue(MIGRATIONS.exists(), "supabase/migrations directory must exist")
        texts = []
        for path in sorted(MIGRATIONS.glob("*.sql")):
            texts.append(path.read_text(encoding="utf-8"))
        return "\n".join(texts).lower()

    def test_deleted_account_detaches_auth_identity_without_deleting_history_row(self):
        text = self.migration_text()
        self.assertIn("alter column auth_user_id drop not null", text)
        self.assertRegex(text, r"foreign key\s*\(auth_user_id\).*references\s+auth\.users\s*\(id\).*on delete set null")

    def test_admin_delete_revokes_app_sessions_then_deletes_supabase_auth_user(self):
        text = self.admin_text()
        delete_block = text[text.index('action === "delete"'):]
        revoke_pos = delete_block.index("await revokeTargetSessions()")
        auth_delete_pos = delete_block.index("admin.auth.admin.deleteUser(target.auth_user_id)")
        self.assertLess(revoke_pos, auth_delete_pos)
        self.assertIn("auth_delete_failed", delete_block)

    def test_registration_still_creates_fresh_auth_identity(self):
        text = self.register_text()
        self.assertIn("admin.auth.admin.createUser", text)
        self.assertIn("auth_user_id: created.user.id", text)
        self.assertNotIn("restore", text.lower())
        self.assertNotIn("undelete", text.lower())


if __name__ == "__main__":
    unittest.main()
