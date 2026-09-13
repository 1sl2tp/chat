from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
M=ROOT/'supabase/migrations/20260913_chat_order_source_states.sql'
assert M.exists()
text=M.read_text(encoding='utf-8').lower()
for token in [
    'add column if not exists source_message_id uuid',
    'references public.v21_messages(id) on delete set null',
    'create table if not exists public.chat_order_source_states',
    'message_id uuid not null references public.v21_messages(id)',
    'admin_account_id uuid not null references public.v21_accounts(id)',
    "check (state in ('pending','working','ignored','imported'))",
    'linked_external_order_id text null',
    'linked_external_order_no text null',
    'primary key(message_id,admin_account_id)',
    'enable row level security',
    'revoke all',
]:
    assert token in text

print('customer order source database contract PASS')
