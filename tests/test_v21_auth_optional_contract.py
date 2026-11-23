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

# Pages must publish only after a successful verified main push; changes
# confined to Supabase cannot trigger a Pages deployment by themselves.
assert 'workflow_run:' in pages
assert 'workflows: ["Verify V21"]' in pages
assert "github.event.workflow_run.event == 'push'" in pages
assert "github.event.workflow_run.head_branch == 'main'" in pages

print("v21 auth optional contract ok")
