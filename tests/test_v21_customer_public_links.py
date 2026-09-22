from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'supabase'/'migrations'/'20260922_customer_public_links.sql').read_text(encoding='utf-8').lower()
EDGE=(ROOT/'supabase'/'functions'/'v21-quote'/'index.ts').read_text(encoding='utf-8').lower()

for needle in [
    'create table if not exists public.v21_customer_public_links',
    'customer_account_id uuid primary key references public.v21_accounts(id)',
    'access_key text not null unique',
    'enable row level security',
    'revoke all on table public.v21_customer_public_links from public, anon, authenticated',
    'v21_customer_public_link_get_or_create',
    'grant execute on function public.v21_customer_public_link_get_or_create(uuid) to service_role',
    'alter table public.chat_quote_snapshots',
    'add column if not exists customer_account_id',
]:
    assert needle in SQL, f'missing public link DB contract: {needle}'

assert 'create policy' not in SQL
assert 'slugify' in EDGE and "lastindexof('~')" in EDGE
assert 'quote_url' in EDGE and 'debt_url' in EDGE
print('customer public links contract PASS')
