create table if not exists public.chat_quote_snapshots (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  scope text not null check (scope in ('all','source')),
  source_key text,
  source_name text,
  item_count integer not null check (item_count >= 0),
  payload jsonb not null,
  created_by uuid not null references public.v21_accounts(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists chat_quote_snapshots_token_active_idx
  on public.chat_quote_snapshots(token)
  where revoked_at is null;

alter table public.chat_quote_snapshots enable row level security;
revoke all on table public.chat_quote_snapshots from anon, authenticated;
