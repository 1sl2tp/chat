begin;

create table if not exists public.chat_ai_scan_sources (
  source_seq bigint generated always as identity primary key,
  message_id uuid not null references public.v21_messages(id) on delete cascade,
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  enqueued_at timestamptz not null default now(),
  unique(message_id)
);

create index if not exists chat_ai_scan_sources_contact_seq_idx
  on public.chat_ai_scan_sources(contact_id,conversation_id,source_seq);

create table if not exists public.chat_ai_scan_cursors (
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  last_source_seq bigint not null default 0 check (last_source_seq >= 0),
  last_message_id uuid null references public.v21_messages(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(contact_id,conversation_id)
);

create table if not exists public.chat_ai_scan_runs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  from_source_seq bigint not null check (from_source_seq > 0),
  to_source_seq bigint not null check (to_source_seq >= from_source_seq),
  source_count integer not null check (source_count > 0),
  source_message_ids uuid[] not null default '{}',
  status text not null default 'done' check (status in ('done','failed')),
  output_text text not null default '',
  error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

create index if not exists chat_ai_scan_runs_contact_seq_idx
  on public.chat_ai_scan_runs(contact_id,conversation_id,to_source_seq desc);

create table if not exists public.chat_ai_scan_lines (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.chat_ai_scan_runs(id) on delete cascade,
  contact_id uuid not null references public.v21_accounts(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  quantity numeric not null check (quantity > 0),
  raw_name text not null check (length(btrim(raw_name)) > 0),
  line_status text not null default 'pending' check (line_status in ('pending','completed')),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(run_id,line_no)
);

create index if not exists chat_ai_scan_lines_contact_id_idx
  on public.chat_ai_scan_lines(contact_id,id);

alter table public.chat_ai_scan_sources enable row level security;
alter table public.chat_ai_scan_cursors enable row level security;
alter table public.chat_ai_scan_runs enable row level security;
alter table public.chat_ai_scan_lines enable row level security;
revoke all on public.chat_ai_scan_sources from public,anon,authenticated;
revoke all on public.chat_ai_scan_cursors from public,anon,authenticated;
revoke all on public.chat_ai_scan_runs from public,anon,authenticated;
revoke all on public.chat_ai_scan_lines from public,anon,authenticated;

create or replace view public.chat_ai_pending_sources
with (security_invoker=true)
as
select
  s.source_seq,
  s.message_id,
  s.contact_id,
  s.conversation_id,
  coalesce(c.last_source_seq,0) as last_source_seq
from public.chat_ai_scan_sources s
left join public.chat_ai_scan_cursors c
  on c.contact_id=s.contact_id
 and c.conversation_id=s.conversation_id
where s.source_seq > coalesce(c.last_source_seq,0);

revoke all on public.chat_ai_pending_sources from public,anon,authenticated;
grant select on public.chat_ai_pending_sources to service_role;

do $$
begin
  if not exists(select 1 from vault.secrets where name='chat_ai_scan_cron_key') then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'chat_ai_scan_cron_key',
      'Private key used by pg_cron to invoke v21-order-scan'
    );
  end if;
end
$$;

create or replace function public.chat_ai_scan_runtime_config()
returns table(scan_key text,model_name text,gemini_api_key text)
language sql
security definer
set search_path = public,vault,pg_temp
as $$
  select
    coalesce((
      select v.decrypted_secret
      from vault.decrypted_secrets v
      where v.name='chat_ai_scan_cron_key'
      order by v.created_at desc
      limit 1
    ),''),
    coalesce((
      select s.model_name
      from public.chat_order_scribe_runtime_settings s
      where s.singleton=true
      limit 1
    ),'gemini-3.5-flash-lite'),
    coalesce((
      select v.decrypted_secret
      from vault.decrypted_secrets v
      where v.name='getlink_order_agent_gemini_api_key'
      order by v.created_at desc
      limit 1
    ),'');
$$;

revoke all on function public.chat_ai_scan_runtime_config() from public,anon,authenticated;
grant execute on function public.chat_ai_scan_runtime_config() to service_role;

create or replace function public.chat_ai_scan_enqueue_new_customer_message()
returns trigger
language plpgsql
security definer
set search_path = public,pg_temp
as $$
begin
  if exists(
    select 1
    from public.v21_accounts a
    where a.id=new.sender_account_id
      and a.contact_group = 'customer'
      and a.deleted_at is null
  ) then
    insert into public.chat_ai_scan_sources(message_id,contact_id,conversation_id)
    values(new.id,new.sender_account_id,new.conversation_id)
    on conflict(message_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.chat_ai_scan_enqueue_new_customer_message() from public,anon,authenticated;

drop trigger if exists trg_chat_ai_scan_enqueue_new_customer_message on public.v21_messages;
create trigger trg_chat_ai_scan_enqueue_new_customer_message
after insert on public.v21_messages
for each row execute function public.chat_ai_scan_enqueue_new_customer_message();

create or replace function public.chat_ai_scan_commit(
  p_contact_id uuid,
  p_conversation_id uuid,
  p_from_source_seq bigint,
  p_to_source_seq bigint,
  p_source_message_ids uuid[],
  p_last_message_id uuid,
  p_output_text text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public,pg_temp
as $$
declare
  v_run_id uuid;
  v_line jsonb;
  v_line_no integer := 0;
  v_source_count integer := coalesce(array_length(p_source_message_ids,1),0);
begin
  if p_from_source_seq is null or p_to_source_seq is null or p_from_source_seq < 1 or p_to_source_seq < p_from_source_seq then
    raise exception 'invalid_scan_range';
  end if;
  if v_source_count < 1 then
    raise exception 'scan_sources_required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'scan_lines_invalid';
  end if;

  insert into public.chat_ai_scan_runs(
    contact_id,conversation_id,from_source_seq,to_source_seq,source_count,source_message_ids,status,output_text,finished_at
  ) values(
    p_contact_id,p_conversation_id,p_from_source_seq,p_to_source_seq,v_source_count,p_source_message_ids,'done',coalesce(p_output_text,''),now()
  ) returning id into v_run_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    insert into public.chat_ai_scan_lines(run_id,contact_id,conversation_id,line_no,quantity,raw_name)
    values(
      v_run_id,
      p_contact_id,
      p_conversation_id,
      v_line_no,
      (v_line->>'quantity')::numeric,
      btrim(v_line->>'name')
    );
  end loop;

  insert into public.chat_ai_scan_cursors(contact_id,conversation_id,last_source_seq,last_message_id,updated_at)
  values(p_contact_id,p_conversation_id,p_to_source_seq,p_last_message_id,now())
  on conflict(contact_id,conversation_id) do update
    set last_source_seq=greatest(public.chat_ai_scan_cursors.last_source_seq,excluded.last_source_seq),
        last_message_id=case
          when excluded.last_source_seq >= public.chat_ai_scan_cursors.last_source_seq then excluded.last_message_id
          else public.chat_ai_scan_cursors.last_message_id
        end,
        updated_at=now();

  return v_run_id;
end;
$$;

revoke all on function public.chat_ai_scan_commit(uuid,uuid,bigint,bigint,uuid[],uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.chat_ai_scan_commit(uuid,uuid,bigint,bigint,uuid[],uuid,text,jsonb) to service_role;

create or replace function public.chat_ai_scan_enqueue_http()
returns bigint
language plpgsql
security definer
set search_path = public,vault,pg_temp
as $$
declare
  v_key text;
  v_request_id bigint;
begin
  select v.decrypted_secret into v_key
  from vault.decrypted_secrets v
  where v.name='chat_ai_scan_cron_key'
  order by v.created_at desc
  limit 1;

  if coalesce(v_key,'')='' then
    raise exception 'scan_key_missing';
  end if;

  select net.http_post(
    url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-order-scan',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-order-scan-key',v_key
    ),
    body := '{"trigger":"cron"}'::jsonb,
    timeout_milliseconds := 1000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.chat_ai_scan_enqueue_http() from public,anon,authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='chat-ai-order-scan-15m' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'chat-ai-order-scan-15m',
    '*/15 * * * *',
    'select public.chat_ai_scan_enqueue_http();'
  );
end
$$;

commit;
