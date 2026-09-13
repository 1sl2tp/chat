from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "supabase/migrations/20260913_chat_order_drafts.sql"
SOURCE_LINK_PATH = ROOT / "supabase/migrations/20260913_chat_order_source_states.sql"
SQL = SQL_PATH.read_text(encoding="utf-8").lower()
SOURCE_LINK_SQL = SOURCE_LINK_PATH.read_text(encoding="utf-8").lower()
compact = "".join(SQL.split())

for table in ["chat_order_drafts", "chat_order_draft_lines"]:
    assert f"create table if not exists public.{table}" in SQL
    assert f"alter table public.{table} enable row level security" in SQL
    assert f"revoke all on public.{table} from public, anon, authenticated" in SQL

assert "contact_id uuid not null" in SQL
assert "conversation_id uuid" in SQL
assert "customer_name text not null" in SQL
assert "created_by_account_id uuid not null" in SQL
assert "status text not null default 'draft'" in SQL
assert "quantity numeric not null" in SQL
assert "raw_name text not null" in SQL
assert "product_id text" in SQL
assert "product_name text" in SQL
assert "unit_price numeric" in SQL
assert "unique (draft_id, line_no)" in SQL
assert "chat_order_draft_create" in SQL
assert "jsonb_array_elements" in SQL
assert "grant execute on function public.chat_order_draft_create" in SQL
assert "to service_role" in SQL
assert "to anon" not in compact.split("chat_order_draft_create", 1)[1]

# Source-message linkage is additive. The deployed base draft migration stays immutable.
assert "source_message_id" not in SQL
assert "alter table public.chat_order_draft_lines" in SOURCE_LINK_SQL
assert "add column if not exists source_message_id uuid" in SOURCE_LINK_SQL
assert "references public.v21_messages(id) on delete set null" in SOURCE_LINK_SQL

print("chat order draft database contract PASS")
