create table if not exists public.chat_call_invites (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  room_name text not null unique,
  contact_id text not null,
  created_by_account_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  opened_at timestamptz,
  guest_joined_at timestamptz,
  admin_joined_at timestamptz,
  revoked_at timestamptz,
  ended_at timestamptz,
  constraint chat_call_invites_expires_after_create check (expires_at > created_at)
);

create index if not exists chat_call_invites_creator_idx
  on public.chat_call_invites (created_by_account_id, created_at desc);
create index if not exists chat_call_invites_expires_idx
  on public.chat_call_invites (expires_at);

alter table public.chat_call_invites enable row level security;

drop policy if exists chat_call_invites_creator_select on public.chat_call_invites;
create policy chat_call_invites_creator_select
  on public.chat_call_invites
  for select
  to authenticated
  using (auth.uid() = created_by_account_id);

revoke all on table public.chat_call_invites from anon;
revoke insert, update, delete on table public.chat_call_invites from authenticated;
grant select on table public.chat_call_invites to authenticated;

-- Realtime is read-only from the browser because RLS exposes only creator-owned rows.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_call_invites'
  ) then
    alter publication supabase_realtime add table public.chat_call_invites;
  end if;
end
$$;
