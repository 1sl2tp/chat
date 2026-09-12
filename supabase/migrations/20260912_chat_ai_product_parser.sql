begin;

-- CHAT owns this parser runtime end-to-end. It only reads CHAT messages and the shared products table.
create table if not exists public.chat_ai_runtime_settings (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'pilot' check (mode in ('off','pilot','live')),
  function_url text not null,
  webhook_secret text not null,
  debounce_seconds integer not null default 4 check (debounce_seconds between 1 and 30),
  updated_at timestamptz not null default now()
);

insert into public.chat_ai_runtime_settings(singleton,mode,function_url,webhook_secret,debounce_seconds)
values (
  true,
  'pilot',
  'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-ai-product-parser',
  replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  4
)
on conflict(singleton) do nothing;

create table if not exists public.chat_ai_pilot_customers (
  account_id uuid primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_ai_message_inbox (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique,
  conversation_id uuid not null,
  customer_account_id uuid not null,
  message_body text not null,
  message_created_at timestamptz not null,
  available_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending','claimed','processed','ignored','failed')),
  turn_key text,
  claimed_at timestamptz,
  processed_at timestamptz,
  last_error text,
  dispatch_request_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists chat_ai_message_inbox_claim_idx
  on public.chat_ai_message_inbox(conversation_id,status,message_created_at);

alter table public.chat_ai_runtime_settings enable row level security;
alter table public.chat_ai_pilot_customers enable row level security;
alter table public.chat_ai_message_inbox enable row level security;
revoke all on public.chat_ai_runtime_settings from public, anon, authenticated;
revoke all on public.chat_ai_pilot_customers from public, anon, authenticated;
revoke all on public.chat_ai_message_inbox from public, anon, authenticated;

create or replace function public.chat_ai_runtime_config()
returns table(mode text, webhook_secret text, pilot_customer_ids uuid[])
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    s.mode,
    s.webhook_secret,
    coalesce((
      select array_agg(p.account_id order by p.account_id)
      from public.chat_ai_pilot_customers p
      where p.enabled=true
    ),'{}'::uuid[]) as pilot_customer_ids
  from public.chat_ai_runtime_settings s
  where s.singleton=true
  limit 1;
$$;
revoke all on function public.chat_ai_runtime_config() from public, anon, authenticated;

create or replace function public.chat_ai_claim_turn(p_conversation_id uuid)
returns table(
  inbox_id uuid,
  message_id uuid,
  conversation_id uuid,
  customer_account_id uuid,
  message_body text,
  message_created_at timestamptz,
  turn_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_latest timestamptz;
  v_turn text := gen_random_uuid()::text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,0));

  update public.chat_ai_message_inbox i
  set status='pending', claimed_at=null, turn_key=null, last_error='stale_claim_recovered'
  where i.conversation_id=p_conversation_id
    and i.status='claimed'
    and i.claimed_at < now()-interval '5 minutes';

  select max(i.message_created_at)
    into v_latest
  from public.chat_ai_message_inbox i
  where i.conversation_id=p_conversation_id
    and i.status='pending';

  if v_latest is null then
    return;
  end if;

  if exists (
    select 1
    from public.chat_ai_message_inbox i
    where i.conversation_id=p_conversation_id
      and i.status='pending'
      and i.message_created_at=v_latest
      and i.available_after > now()
  ) then
    return;
  end if;

  return query
  with claimed as (
    update public.chat_ai_message_inbox i
    set status='claimed', claimed_at=now(), turn_key=v_turn
    where i.conversation_id=p_conversation_id
      and i.status='pending'
      and i.message_created_at <= v_latest
    returning i.id,i.message_id,i.conversation_id,i.customer_account_id,i.message_body,i.message_created_at,i.turn_key
  )
  select c.id,c.message_id,c.conversation_id,c.customer_account_id,c.message_body,c.message_created_at,c.turn_key
  from claimed c
  order by c.message_created_at,c.id;
end;
$$;
revoke all on function public.chat_ai_claim_turn(uuid) from public, anon, authenticated;

create or replace function public.chat_ai_enqueue_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_other_admin boolean := false;
  v_delay integer := 4;
begin
  if new.deleted_at is not null or btrim(coalesce(new.body,''))='' then
    return new;
  end if;

  select a.role into v_role
  from public.v21_accounts a
  where a.id=new.sender_account_id
    and a.deleted_at is null
    and a.locked_at is null;

  if v_role is distinct from 'user' then
    return new;
  end if;

  select exists(
    select 1
    from public.v21_conversations c
    join public.v21_accounts a
      on a.id = case when c.member_a=new.sender_account_id then c.member_b else c.member_a end
    where c.id=new.conversation_id
      and new.sender_account_id in (c.member_a,c.member_b)
      and a.role='admin'
      and a.deleted_at is null
      and a.locked_at is null
  ) into v_other_admin;

  if not v_other_admin then
    return new;
  end if;

  select coalesce(s.debounce_seconds,4) into v_delay
  from public.chat_ai_runtime_settings s
  where s.singleton=true;

  insert into public.chat_ai_message_inbox(
    message_id,conversation_id,customer_account_id,message_body,message_created_at,available_after
  ) values (
    new.id,new.conversation_id,new.sender_account_id,new.body,new.created_at,new.created_at + make_interval(secs=>v_delay)
  )
  on conflict(message_id) do nothing;

  return new;
end;
$$;
revoke all on function public.chat_ai_enqueue_message() from public, anon, authenticated;

create or replace function public.chat_ai_dispatch_inbox()
returns trigger
language plpgsql
security definer
set search_path = public, net, pg_temp
as $$
declare
  v_url text;
  v_secret text;
  v_mode text;
  v_request_id bigint;
begin
  select s.function_url,s.webhook_secret,s.mode
    into v_url,v_secret,v_mode
  from public.chat_ai_runtime_settings s
  where s.singleton=true;

  if v_mode='off' or coalesce(btrim(v_url),'')='' or coalesce(btrim(v_secret),'')='' then
    return new;
  end if;

  begin
    select net.http_post(
      url:=v_url,
      headers:=jsonb_build_object(
        'content-type','application/json',
        'x-chat-ai-secret',v_secret
      ),
      body:=jsonb_build_object(
        'message_id',new.message_id,
        'conversation_id',new.conversation_id
      ),
      timeout_milliseconds:=5000
    ) into v_request_id;

    update public.chat_ai_message_inbox
    set dispatch_request_id=v_request_id
    where id=new.id;
  exception when others then
    update public.chat_ai_message_inbox
    set last_error='dispatch:'||sqlerrm
    where id=new.id;
  end;

  return new;
end;
$$;
revoke all on function public.chat_ai_dispatch_inbox() from public, anon, authenticated;

drop trigger if exists chat_ai_enqueue_message_trg on public.v21_messages;
create trigger chat_ai_enqueue_message_trg
after insert on public.v21_messages
for each row execute function public.chat_ai_enqueue_message();

drop trigger if exists chat_ai_dispatch_inbox_trg on public.chat_ai_message_inbox;
create trigger chat_ai_dispatch_inbox_trg
after insert on public.chat_ai_message_inbox
for each row execute function public.chat_ai_dispatch_inbox();

-- Remove any older CHAT AI enqueue trigger that points at a differently named legacy function.
do $$
declare
  r record;
begin
  for r in
    select t.tgname
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    where n.nspname='public'
      and c.relname='v21_messages'
      and not t.tgisinternal
      and p.proname like '%ai_enqueue_chat_message%'
      and p.proname <> 'chat_ai_enqueue_message'
  loop
    execute format('drop trigger if exists %I on public.v21_messages',r.tgname);
  end loop;
end;
$$;

commit;
