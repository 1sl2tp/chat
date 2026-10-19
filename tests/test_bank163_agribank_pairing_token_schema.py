"""BANK-163: Agribank notifier token issuance resolves pgcrypto in the extensions schema."""
from pathlib import Path

MIGRATION = Path("supabase/migrations/20261019092000_fix_agribank_issue_token_pgcrypto_schema.sql")
source = MIGRATION.read_text(encoding="utf8")
assert "extensions.gen_random_bytes(32)" in source
assert "extensions.digest(secret,'sha256')" in source
assert "set search_path to 'public','v21_private','pg_temp'" in source
assert "v21_private.current_active_account_id()" in source
assert "a.role='admin'" in source
assert "grant execute on function public.chat_agribank_issue_device_token(text) to authenticated;" in source
assert "revoke all on function public.chat_agribank_issue_device_token(text) from public,anon;" in source
assert "insert into public.taphoa_sms_ingest_devices" in source
print("BANK-163 Admin token pgcrypto schema contract PASS")
