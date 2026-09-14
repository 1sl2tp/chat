begin;

create table if not exists public.chat_customer_summary_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.v21_accounts(id) on delete cascade,
  customer_username text null,
  customer_display_name text null,
  message_count integer not null default 0 check (message_count >= 0),
  customer_message_count integer not null default 0 check (customer_message_count >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  status text not null check (status in ('done','failed')),
  raw_output text not null default '',
  result_json jsonb not null default '{"items":[],"notes":[]}'::jsonb,
  error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

create index if not exists chat_customer_summary_runs_customer_idx
  on public.chat_customer_summary_runs(customer_id,finished_at desc);

create table if not exists public.chat_customer_summary_state (
  customer_id uuid primary key references public.v21_accounts(id) on delete cascade,
  last_scanned_at timestamptz null,
  last_run_id uuid null references public.chat_customer_summary_runs(id) on delete set null,
  last_result jsonb not null default '{"items":[],"notes":[]}'::jsonb,
  last_error text null,
  updated_at timestamptz not null default now()
);

alter table public.chat_customer_summary_runs enable row level security;
alter table public.chat_customer_summary_state enable row level security;
revoke all on public.chat_customer_summary_runs from public,anon,authenticated;
revoke all on public.chat_customer_summary_state from public,anon,authenticated;

create or replace function public.chat_customer_summary_claim_batch(p_limit integer default 15)
returns table(customer_id uuid,username text,display_name text)
language plpgsql
security definer
set search_path = public,pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('chat_customer_summary_claim_batch'));
  return query
  with eligible as (
    select a.id,a.username,a.display_name
    from public.v21_accounts a
    left join public.chat_customer_summary_state s on s.customer_id=a.id
    where a.contact_group='customer'
      and a.deleted_at is null
      and exists(
        select 1 from public.v21_messages m
        where m.sender_account_id = a.id
          and m.deleted_at is null
      )
    order by s.last_scanned_at asc nulls first,a.id
    LIMIT 15
  ), touched as (
    insert into public.chat_customer_summary_state(customer_id,last_scanned_at,updated_at)
    select e.id,now(),now() from eligible e
    limit least(greatest(coalesce(p_limit,15),1),15)
    on conflict(customer_id) do update
      set last_scanned_at=excluded.last_scanned_at,
          updated_at=excluded.updated_at
    returning chat_customer_summary_state.customer_id
  )
  select e.id,e.username,e.display_name
  from eligible e
  join touched t on t.customer_id=e.id
  limit least(greatest(coalesce(p_limit,15),1),15);
end;
$$;

revoke all on function public.chat_customer_summary_claim_batch(integer) from public,anon,authenticated;
grant execute on function public.chat_customer_summary_claim_batch(integer) to service_role;

-- Production runtime wiring is installed by the managed Supabase migration:
-- chat_customer_summary_runtime_config(), chat_customer_summary_scan_enqueue_http(),
-- and pg_cron job chat-customer-summary-scan-1m on '* * * * *'.
-- The runtime function uses the existing project-managed AI/cron credentials;
-- no credential material is stored in this repository.

commit;
