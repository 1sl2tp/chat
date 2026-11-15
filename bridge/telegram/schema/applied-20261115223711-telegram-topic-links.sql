-- TELE-004 applied to Supabase Chat project vtqhbhrkdxirqeqkgylo.
-- Supabase migration history: 20261115223711 / telegram_topic_links_service_only_20261116.
-- Historical reference only. Do not re-apply via GitHub CI; run new versioned migrations for future changes.
-- User explicitly approved creating this one new table. No customer rows were inserted.

create table if not exists public.v21_telegram_topic_links (
  telegram_chat_id bigint not null check (telegram_chat_id > 0),
  chat_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  telegram_thread_id bigint null check (telegram_thread_id > 0),
  topic_title text not null check (char_length(trim(topic_title)) between 1 and 128),
  state text not null default 'reserved'
    check (state in ('reserved','active','needs_review','disabled')),
  last_error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (telegram_chat_id, chat_account_id),
  unique (telegram_chat_id, telegram_thread_id),
  constraint active_requires_thread check (state <> 'active' or telegram_thread_id is not null)
);
comment on table public.v21_telegram_topic_links is
  'Telegram Topic presentation mapping only. Chat accounts remain canonical; Telegram never owns customers or invoices.';
alter table public.v21_telegram_topic_links enable row level security;
revoke all on public.v21_telegram_topic_links from public, anon, authenticated;
grant select, insert, update on public.v21_telegram_topic_links to service_role;
-- No RLS policies for anon/authenticated; service-only access.
-- DO NOT add a trigger, cron, HTTP webhook, or automatic deployment to this DDL.
