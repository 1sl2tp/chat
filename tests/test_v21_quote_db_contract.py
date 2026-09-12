from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260913_chat_quote_snapshots.sql"

assert MIGRATION.exists(), "quotation snapshot migration must exist"

sql = MIGRATION.read_text(encoding="utf-8").lower()

required = [
    "create table if not exists public.chat_quote_snapshots",
    "token text not null unique",
    "scope text not null check (scope in ('all','source'))",
    "source_key text",
    "source_name text",
    "item_count integer not null",
    "payload jsonb not null",
    "created_by uuid not null references public.v21_accounts(id)",
    "created_at timestamptz not null default now()",
    "revoked_at timestamptz",
    "alter table public.chat_quote_snapshots enable row level security",
    "revoke all on table public.chat_quote_snapshots from anon, authenticated",
]
for needle in required:
    assert needle in sql, f"missing quotation snapshot DB contract: {needle}"

assert "create policy" not in sql, "quotation snapshots must not gain a direct browser read policy"

print("chat quote database contract PASS")
