-- Admin-only Web Push foundation.
-- Canonical Chat data remains v21_messages/v21_media_assets; push is secondary delivery only.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.v21_push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.v21_accounts(id) on delete cascade,
  device_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  user_agent text,
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v21_push_subscriptions_account_enabled_idx
  on public.v21_push_subscriptions(account_id,enabled);

create table if not exists public.v21_push_outbox(
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.v21_messages(id) on delete cascade,
  recipient_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  sender_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  state text not null default 'pending' check(state in('pending','processing','sent','retry','dead')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(message_id,recipient_account_id)
);

create index if not exists v21_push_outbox_due_idx
  on public.v21_push_outbox(state,available_at,created_at);

alter table public.v21_push_subscriptions enable row level security;
alter table public.v21_push_outbox enable row level security;

revoke all on table public.v21_push_subscriptions from public,anon,authenticated;
revoke all on table public.v21_push_outbox from public,anon,authenticated;
grant select,insert,update,delete on table public.v21_push_subscriptions to service_role;
grant select,insert,update,delete on table public.v21_push_outbox to service_role;

create or replace function v21_private.enqueue_admin_push()
returns trigger
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_sender_role text;
  v_recipient_id uuid;
  v_recipient_role text;
begin
  if new.deleted_at is not null then return new; end if;

  select a.role into v_sender_role
  from public.v21_accounts a
  where a.id=new.sender_account_id
    and a.deleted_at is null
    and a.locked_at is null;
  if v_sender_role<>'user' then return new; end if;

  select case
    when c.member_a=new.sender_account_id then c.member_b
    when c.member_b=new.sender_account_id then c.member_a
    else null
  end
  into v_recipient_id
  from public.v21_conversations c
  where c.id=new.conversation_id;
  if v_recipient_id is null then return new; end if;

  select a.role into v_recipient_role
  from public.v21_accounts a
  where a.id=v_recipient_id
    and a.deleted_at is null
    and a.locked_at is null;
  if v_recipient_role<>'admin' then return new; end if;

  insert into public.v21_push_outbox(
    message_id,recipient_account_id,sender_account_id,conversation_id,state,available_at
  ) values(
    new.id,v_recipient_id,new.sender_account_id,new.conversation_id,'pending',now()
  )
  on conflict(message_id,recipient_account_id) do nothing;

  return new;
exception when others then
  -- Push is secondary delivery and must never block canonical message insertion.
  return new;
end;
$$;

revoke all on function v21_private.enqueue_admin_push() from public;

drop trigger if exists v21_admin_push_enqueue_trg on public.v21_messages;
create trigger v21_admin_push_enqueue_trg
after insert on public.v21_messages
for each row
execute function v21_private.enqueue_admin_push();

create or replace function public.v21_admin_push_claim(
  p_limit integer default 20
) returns table(
  outbox_id uuid,
  message_id uuid,
  recipient_account_id uuid,
  sender_account_id uuid,
  conversation_id uuid,
  attempt_count integer
)
language sql
security definer
set search_path to 'public','v21_private','auth'
as $$
  with due as (
    select o.id
    from public.v21_push_outbox o
    where o.state in('pending','retry')
      and o.available_at<=now()
    order by o.created_at,o.id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  ), claimed as (
    update public.v21_push_outbox o
    set state='processing',
        attempt_count=o.attempt_count+1,
        updated_at=now()
    from due
    where o.id=due.id
    returning o.id,o.message_id,o.recipient_account_id,o.sender_account_id,o.conversation_id,o.attempt_count
  )
  select id,message_id,recipient_account_id,sender_account_id,conversation_id,attempt_count
  from claimed;
$$;

create or replace function public.v21_admin_push_result(
  p_outbox_id uuid,
  p_ok boolean,
  p_error text,
  p_dead boolean
) returns boolean
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_attempt integer;
  v_updated integer;
begin
  select o.attempt_count into v_attempt
  from public.v21_push_outbox o
  where o.id=p_outbox_id
  for update;
  if v_attempt is null then return false; end if;

  update public.v21_push_outbox o
  set state=case
        when coalesce(p_ok,false) then 'sent'
        when coalesce(p_dead,false) or v_attempt>=5 then 'dead'
        else 'retry'
      end,
      available_at=case
        when coalesce(p_ok,false) or coalesce(p_dead,false) or v_attempt>=5 then now()
        else now()+make_interval(secs=>least(300,10*power(2,greatest(0,v_attempt-1))::integer))
      end,
      last_error=case when coalesce(p_ok,false) then null else left(coalesce(p_error,'push_failed'),1000) end,
      updated_at=now()
  where o.id=p_outbox_id and o.state='processing';
  get diagnostics v_updated=row_count;
  return v_updated=1;
end;
$$;

revoke all on function public.v21_admin_push_claim(integer) from public,anon,authenticated;
revoke all on function public.v21_admin_push_result(uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.v21_admin_push_claim(integer) to service_role;
grant execute on function public.v21_admin_push_result(uuid,boolean,text,boolean) to service_role;

-- Wake authentication: plaintext token stays private; only its SHA-256 is exposed to service-role reads.
create table if not exists v21_private.v21_admin_push_wake_secret(
  id text primary key,
  token text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.v21_admin_push_auth(
  id text primary key,
  token_sha256 text not null,
  updated_at timestamptz not null default now()
);

alter table public.v21_admin_push_auth enable row level security;
revoke all on table public.v21_admin_push_auth from public,anon,authenticated;
grant select on table public.v21_admin_push_auth to service_role;
revoke all on table v21_private.v21_admin_push_wake_secret from public,anon,authenticated;
grant select on table v21_private.v21_admin_push_wake_secret to service_role;

do $$
declare
  v_token text;
begin
  insert into v21_private.v21_admin_push_wake_secret(id,token)
  values('primary',encode(extensions.gen_random_bytes(32),'hex'))
  on conflict(id) do nothing;

  select token into v_token
  from v21_private.v21_admin_push_wake_secret
  where id='primary';

  insert into public.v21_admin_push_auth(id,token_sha256,updated_at)
  values('primary',encode(extensions.digest(v_token,'sha256'),'hex'),now())
  on conflict(id) do update
  set token_sha256=excluded.token_sha256,
      updated_at=excluded.updated_at;
end;
$$;

create or replace function v21_private.admin_push_signal()
returns trigger
language plpgsql
security definer
set search_path to 'public','v21_private','net'
as $$
declare
  v_token text;
begin
  select token into v_token
  from v21_private.v21_admin_push_wake_secret
  where id='primary';

  if coalesce(v_token,'')='' then return new; end if;

  begin
    perform net.http_post(
      url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-admin-push',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-push-wake-token',v_token
      ),
      body := jsonb_build_object('action','drain'),
      timeout_milliseconds := 5000
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

revoke all on function v21_private.admin_push_signal() from public;

drop trigger if exists v21_admin_push_signal_trg on public.v21_push_outbox;
create trigger v21_admin_push_signal_trg
after insert on public.v21_push_outbox
for each row
when (new.state='pending')
execute function v21_private.admin_push_signal();
