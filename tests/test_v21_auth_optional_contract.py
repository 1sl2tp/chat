from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

migration = (ROOT / "supabase/migrations/20261005033000_v21_auth_optional.sql").read_text(encoding="utf-8")
edge = (ROOT / "supabase/functions/v21-account-admin/index.ts").read_text(encoding="utf-8")
pages = (ROOT / ".github/workflows/pages.yml").read_text(encoding="utf-8")

# Non-login business/contact/customer accounts are valid v21_accounts rows.
assert "alter column auth_user_id drop not null" in migration.lower()
assert "auth_user_id remains unique when present" in migration.lower()

# Admin profile edits never provision Auth implicitly.
assert 'if (password && !target.auth_user_id)' in edge
assert 'code: "login_not_enabled"' in edge
assert '(usernameChanged || password) && target.auth_user_id' in edge
assert "createUser(" not in edge

# Edge/migration-only changes must not publish the static Chat site.
assert '- "supabase/**"' in pages

print("v21 auth optional contract ok")
