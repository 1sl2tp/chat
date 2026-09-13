begin;

alter table public.chat_order_draft_lines
  add column if not exists source_message_id uuid null
  references public.v21_messages(id) on delete set null;

create index if not exists chat_order_draft_lines_source_message_idx
  on public.chat_order_draft_lines(source_message_id)
  where source_message_id is not null;

create table if not exists public.chat_order_source_states (
  message_id uuid not null references public.v21_messages(id) on delete cascade,
  admin_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','working','ignored','imported')),
  linked_draft_id uuid null references public.chat_order_drafts(id) on delete set null,
  linked_external_order_id text null,
  linked_external_order_no text null,
  updated_at timestamptz not null default now(),
  primary key(message_id,admin_account_id)
);

create index if not exists chat_order_source_states_contact_updated_idx
  on public.chat_order_source_states(admin_account_id,contact_id,updated_at desc);

alter table public.chat_order_source_states enable row level security;
revoke all on public.chat_order_source_states from public,anon,authenticated;

commit;
