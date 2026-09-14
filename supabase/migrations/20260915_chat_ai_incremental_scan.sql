-- Incremental CHAT AI scan. The cursor is message_seq, never timestamp-only.

create sequence if not exists public.v21_messages_message_seq_seq;

alter table public.v21_messages
  add column if not exists message_seq bigint;

lock table public.v21_messages in share row exclusive mode;

with base as (
  select coalesce(max(message_seq),0)::bigint as max_seq
  from public.v21_messages
), numbered as (
  select m.id,
         (select max_seq from base) + row_number() over(order by m.created_at,m.id) as seq
  from public.v21_messages m
  where m.message_seq is null
)
update public.v21_messages m
set message_seq=n.seq
from numbered n
where m.id=n.id;

select setval(
  'public.v21_messages_message_seq_seq',
  greatest(coalesce((select max(message_seq) from public.v21_messages),0),1),
  coalesce((select max(message_seq) from public.v21_messages),0)>0
);

alter sequence public.v21_messages_message_seq_seq
  owned by public.v21_messages.message_seq;

alter table public.v21_messages
  alter column message_seq set default nextval('public.v21_messages_message_seq_seq'),
  alter column message_seq set not null;

create unique index if not exists idx_v21_messages_message_seq_unique
  on public.v21_messages(message_seq);
create index if not exists idx_v21_messages_conversation_sender_seq
  on public.v21_messages(conversation_id,sender_account_id,message_seq)
  where deleted_at is null;

create table if not exists public.chat_ai_scan_runtime (
  singleton boolean primary key default true check(singleton),
  scheduler_token text not null default (
    replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
  ),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.chat_ai_scan_runtime(singleton)
values(true)
on conflict(singleton) do nothing;

create table if not exists public.chat_ai_scan_cursors (
  admin_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  last_message_seq bigint not null default 0,
  last_message_id uuid references public.v21_messages(id) on delete set null,
  last_scan_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(admin_account_id,contact_id)
);

create index if not exists idx_chat_ai_scan_cursors_conversation
  on public.chat_ai_scan_cursors(conversation_id,last_message_seq);

create table if not exists public.chat_ai_intakes (
  id uuid primary key default gen_random_uuid(),
  admin_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  status text not null default 'open' check(status in ('open','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists idx_chat_ai_intakes_one_open
  on public.chat_ai_intakes(admin_account_id,contact_id)
  where status='open';

create table if not exists public.chat_ai_scan_runs (
  id uuid primary key default gen_random_uuid(),
  run_seq bigint generated always as identity unique,
  admin_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  intake_id uuid references public.chat_ai_intakes(id) on delete set null,
  from_message_seq bigint not null,
  to_message_seq bigint not null,
  source_count integer not null default 0 check(source_count>=0),
  line_count integer not null default 0 check(line_count>=0),
  status text not null default 'running' check(status in ('running','completed','failed')),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_chat_ai_scan_runs_pair
  on public.chat_ai_scan_runs(admin_account_id,contact_id,run_seq desc);

create table if not exists public.chat_ai_scan_lines (
  id uuid primary key default gen_random_uuid(),
  line_seq bigint generated always as identity unique,
  scan_id uuid not null references public.chat_ai_scan_runs(id) on delete cascade,
  intake_id uuid not null references public.chat_ai_intakes(id) on delete cascade,
  admin_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  source_message_id uuid not null references public.v21_messages(id) on delete cascade,
  source_message_seq bigint not null,
  source_line_no integer not null check(source_line_no>0),
  quantity numeric not null check(quantity>0),
  name text not null check(length(btrim(name))>0),
  raw_text text not null default '',
  status text not null default 'pending' check(status in ('pending','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(admin_account_id,source_message_id,source_line_no)
);

create index if not exists idx_chat_ai_scan_lines_open_order
  on public.chat_ai_scan_lines(admin_account_id,contact_id,status,line_seq);

alter table public.chat_ai_scan_runtime enable row level security;
alter table public.chat_ai_scan_cursors enable row level security;
alter table public.chat_ai_intakes enable row level security;
alter table public.chat_ai_scan_runs enable row level security;
alter table public.chat_ai_scan_lines enable row level security;

revoke all on public.chat_ai_scan_runtime from anon,authenticated;
revoke all on public.chat_ai_scan_cursors from anon,authenticated;
revoke all on public.chat_ai_intakes from anon,authenticated;
revoke all on public.chat_ai_scan_runs from anon,authenticated;
revoke all on public.chat_ai_scan_lines from anon,authenticated;

create or replace function public.chat_ai_try_scan_lock(p_hold_seconds integer default 840)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_locked boolean:=false;
begin
  update public.chat_ai_scan_runtime
  set locked_until=now()+make_interval(secs=>greatest(30,least(coalesce(p_hold_seconds,840),900))),
      updated_at=now()
  where singleton=true
    and (locked_until is null or locked_until<=now())
  returning true into v_locked;
  return coalesce(v_locked,false);
end;
$$;

create or replace function public.chat_ai_release_scan_lock()
returns void
language sql
security definer
set search_path=public
as $$
  update public.chat_ai_scan_runtime
  set locked_until=null,updated_at=now()
  where singleton=true;
$$;

create or replace function public.chat_ai_seed_cursor(
  p_admin_account_id uuid,
  p_contact_id uuid,
  p_conversation_id uuid,
  p_last_message_seq bigint,
  p_last_message_id uuid
)
returns void
language sql
security definer
set search_path=public
as $$
  insert into public.chat_ai_scan_cursors(
    admin_account_id,contact_id,conversation_id,last_message_seq,last_message_id,last_scan_at,updated_at
  ) values(
    p_admin_account_id,p_contact_id,p_conversation_id,greatest(coalesce(p_last_message_seq,0),0),p_last_message_id,now(),now()
  )
  on conflict(admin_account_id,contact_id) do nothing;
$$;

create or replace function public.chat_ai_finalize_scan(
  p_run_id uuid,
  p_admin_account_id uuid,
  p_contact_id uuid,
  p_conversation_id uuid,
  p_to_message_seq bigint,
  p_to_message_id uuid,
  p_lines jsonb default '[]'::jsonb
)
returns table(intake_id uuid,inserted_count integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_intake_id uuid;
  v_line jsonb;
  v_message_id uuid;
  v_message_seq bigint;
  v_line_no integer;
  v_quantity numeric;
  v_name text;
  v_raw text;
  v_count integer:=0;
begin
  if not exists(
    select 1 from public.chat_ai_scan_runs r
    where r.id=p_run_id
      and r.admin_account_id=p_admin_account_id
      and r.contact_id=p_contact_id
      and r.conversation_id=p_conversation_id
      and r.status='running'
  ) then
    raise exception 'scan_run_invalid';
  end if;

  insert into public.chat_ai_intakes(admin_account_id,contact_id,conversation_id,status,updated_at)
  values(p_admin_account_id,p_contact_id,p_conversation_id,'open',now())
  on conflict(admin_account_id,contact_id) where status='open'
  do update set conversation_id=excluded.conversation_id,updated_at=now()
  returning id into v_intake_id;

  for v_line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    v_message_id=nullif(v_line->>'source_message_id','')::uuid;
    v_message_seq=nullif(v_line->>'source_message_seq','')::bigint;
    v_line_no=nullif(v_line->>'source_line_no','')::integer;
    v_quantity=nullif(v_line->>'quantity','')::numeric;
    v_name=btrim(coalesce(v_line->>'name',''));
    v_raw=coalesce(v_line->>'raw_text','');

    if v_message_id is null or v_message_seq is null or v_line_no is null or
       v_line_no<1 or v_quantity is null or v_quantity<=0 or v_name='' then
      raise exception 'scan_line_invalid';
    end if;

    if not exists(
      select 1 from public.v21_messages m
      where m.id=v_message_id
        and m.message_seq=v_message_seq
        and m.conversation_id=p_conversation_id
        and m.sender_account_id=p_contact_id
        and m.deleted_at is null
    ) then
      raise exception 'scan_source_invalid';
    end if;

    insert into public.chat_ai_scan_lines(
      scan_id,intake_id,admin_account_id,contact_id,conversation_id,
      source_message_id,source_message_seq,source_line_no,quantity,name,raw_text,status
    ) values(
      p_run_id,v_intake_id,p_admin_account_id,p_contact_id,p_conversation_id,
      v_message_id,v_message_seq,v_line_no,v_quantity,v_name,v_raw,'pending'
    )
    on conflict(admin_account_id,source_message_id,source_line_no) do nothing;

    if found then v_count:=v_count+1; end if;
  end loop;

  insert into public.chat_ai_scan_cursors(
    admin_account_id,contact_id,conversation_id,last_message_seq,last_message_id,last_scan_at,updated_at
  ) values(
    p_admin_account_id,p_contact_id,p_conversation_id,p_to_message_seq,p_to_message_id,now(),now()
  )
  on conflict(admin_account_id,contact_id) do update
  set conversation_id=excluded.conversation_id,
      last_message_seq=excluded.last_message_seq,
      last_message_id=excluded.last_message_id,
      last_scan_at=now(),
      updated_at=now()
  where public.chat_ai_scan_cursors.last_message_seq<excluded.last_message_seq;

  update public.chat_ai_scan_runs
  set intake_id=v_intake_id,status='completed',line_count=v_count,completed_at=now()
  where id=p_run_id;

  return query select v_intake_id,v_count;
end;
$$;

revoke all on function public.chat_ai_try_scan_lock(integer) from public,anon,authenticated;
revoke all on function public.chat_ai_release_scan_lock() from public,anon,authenticated;
revoke all on function public.chat_ai_seed_cursor(uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
revoke all on function public.chat_ai_finalize_scan(uuid,uuid,uuid,uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.chat_ai_try_scan_lock(integer) to service_role;
grant execute on function public.chat_ai_release_scan_lock() to service_role;
grant execute on function public.chat_ai_seed_cursor(uuid,uuid,uuid,bigint,uuid) to service_role;
grant execute on function public.chat_ai_finalize_scan(uuid,uuid,uuid,uuid,bigint,uuid,jsonb) to service_role;

-- Baseline existing KH conversations at the latest inbound sequence.
-- This seed prevents any pre-feature chat history from being sent to AI.
insert into public.chat_ai_scan_cursors(
  admin_account_id,contact_id,conversation_id,last_message_seq,last_message_id,last_scan_at,updated_at
)
select
  a.id,
  c.id,
  conv.id,
  coalesce(last_inbound.message_seq,0),
  last_inbound.id,
  now(),
  now()
from public.v21_conversations conv
join public.v21_accounts a
  on a.id in (conv.member_a,conv.member_b)
 and a.role='admin'
 and a.deleted_at is null
 and a.locked_at is null
join public.v21_accounts c
  on c.id=case when conv.member_a=a.id then conv.member_b else conv.member_a end
 and c.contact_group='customer'
 and c.deleted_at is null
 and c.locked_at is null
left join lateral (
  select m.id,m.message_seq
  from public.v21_messages m
  where m.conversation_id=conv.id
    and m.sender_account_id=c.id
    and m.deleted_at is null
  order by m.message_seq desc
  limit 1
) last_inbound on true
on conflict(admin_account_id,contact_id) do nothing;

-- Recreate the exact 15-minute scheduler. It reads the private token inside Postgres;
-- the token is never exposed to browser clients.
do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname='chat-ai-order-scan-15m' loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'chat-ai-order-scan-15m',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url:='https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-order-auto-scan',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'x-chat-scan-token',(select scheduler_token from public.chat_ai_scan_runtime where singleton=true)
        ),
        body:='{}'::jsonb,
        timeout_milliseconds:=120000
      );
    $job$
  );
end;
$$;
