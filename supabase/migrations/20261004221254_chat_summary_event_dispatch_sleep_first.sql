create table if not exists v21_private.chat_customer_summary_dispatch_state (
  id smallint primary key check (id = 1),
  lease_until timestamptz,
  last_enqueued_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into v21_private.chat_customer_summary_dispatch_state(id)
values (1)
on conflict (id) do nothing;

revoke all on table v21_private.chat_customer_summary_dispatch_state from public,anon,authenticated;

create or replace function public.chat_customer_summary_scan_enqueue_http()
returns bigint
language plpgsql
security definer
set search_path=public,vault,pg_temp
as $$
declare v_key text; v_request_id bigint;
begin
  select v.decrypted_secret into v_key
  from vault.decrypted_secrets v
  where v.name='chat_ai_scan_cron_key'
  order by v.created_at desc limit 1;
  if coalesce(v_key,'')='' then raise exception 'scan_key_missing'; end if;

  select net.http_post(
    url := 'https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-customer-summary-scan',
    headers := jsonb_build_object('content-type','application/json','x-customer-summary-key',v_key),
    body := '{"trigger":"event"}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;

create or replace function public.chat_customer_summary_enqueue_if_needed()
returns bigint
language plpgsql
security definer
set search_path=public,v21_private,pg_temp
as $$
declare
  v_request_id bigint;
  v_acquired integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('chat_customer_summary_dispatch'));

  if not exists(
    select 1
    from public.chat_customer_summary_state s
    where s.dirty_version > s.processed_version
      and (s.claim_started_at is null or s.claim_started_at < now()-interval '10 minutes')
      and (
        s.last_error is null
        or s.last_scanned_at is null
        or s.last_scanned_at < now()-interval '6 hours'
      )
  ) then
    return null;
  end if;

  update v21_private.chat_customer_summary_dispatch_state d
  set lease_until=now()+interval '10 minutes',
      updated_at=now()
  where d.id=1
    and (d.lease_until is null or d.lease_until <= now());
  get diagnostics v_acquired = row_count;

  if v_acquired=0 then
    return null;
  end if;

  begin
    select public.chat_customer_summary_scan_enqueue_http()
      into v_request_id;

    update v21_private.chat_customer_summary_dispatch_state
    set last_enqueued_at=now(),
        updated_at=now()
    where id=1;

    return v_request_id;
  exception when others then
    update v21_private.chat_customer_summary_dispatch_state
    set lease_until=null,
        updated_at=now()
    where id=1;
    raise warning 'chat_customer_summary_dispatch_enqueue_failed: %', sqlerrm;
    return null;
  end;
end;
$$;

create or replace function public.chat_customer_summary_dispatch_finish()
returns bigint
language plpgsql
security definer
set search_path=public,v21_private,pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('chat_customer_summary_dispatch'));

  update v21_private.chat_customer_summary_dispatch_state
  set lease_until=null,
      updated_at=now()
  where id=1;

  return public.chat_customer_summary_enqueue_if_needed();
end;
$$;

create or replace function public.chat_customer_summary_message_dirty_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='UPDATE' and old.sender_account_id is distinct from new.sender_account_id then
    perform public.chat_customer_summary_mark_dirty(old.sender_account_id);
  end if;
  perform public.chat_customer_summary_mark_dirty(new.sender_account_id);
  perform public.chat_customer_summary_enqueue_if_needed();
  return new;
end;
$$;

create or replace function public.chat_customer_summary_media_dirty_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='UPDATE' and old.kind='image' then
    perform public.chat_customer_summary_mark_dirty(old.owner_account_id);
  end if;
  if new.kind='image' then
    perform public.chat_customer_summary_mark_dirty(new.owner_account_id);
  end if;
  perform public.chat_customer_summary_enqueue_if_needed();
  return new;
end;
$$;

create or replace function public.chat_customer_summary_work_feed()
returns table(
  customer_id uuid,
  username text,
  display_name text,
  last_scanned_at timestamptz,
  result_json jsonb,
  last_error text,
  completed_item_keys text[]
)
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_actor_id uuid;
begin
  select actor.id
    into v_actor_id
  from public.v21_accounts actor
  where actor.auth_user_id = auth.uid()
    and actor.role = 'admin'
    and actor.deleted_at is null
    and actor.locked_at is null
  limit 1;

  if v_actor_id is null then
    raise exception 'admin_required';
  end if;

  perform public.chat_customer_summary_enqueue_if_needed();

  return query
  select
    a.id,
    a.username,
    a.display_name,
    s.last_scanned_at,
    coalesce(s.last_result,'{"items":[],"notes":[],"totalLines":0,"totals":[]}'::jsonb),
    s.last_error,
    coalesce((
      select array_agg(c.item_key order by c.completed_at, c.item_key)
      from public.chat_customer_summary_completion c
      where c.actor_account_id = v_actor_id
        and c.customer_id = a.id
    ), array[]::text[])
  from public.chat_customer_summary_state s
  join public.v21_accounts a on a.id = s.customer_id
  where a.contact_group = 'customer'
    and a.deleted_at is null
    and s.last_scanned_at is not null
  order by s.last_scanned_at desc nulls last, lower(coalesce(a.display_name,a.username,'')), a.id;
end;
$$;

revoke all on function public.chat_customer_summary_enqueue_if_needed() from public,anon,authenticated;
revoke all on function public.chat_customer_summary_dispatch_finish() from public,anon,authenticated;
grant execute on function public.chat_customer_summary_enqueue_if_needed() to postgres,service_role;
grant execute on function public.chat_customer_summary_dispatch_finish() to postgres,service_role;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='chat-customer-summary-scan-5m'
  order by jobid desc
  limit 1;

  if v_jobid is not null then
    perform cron.alter_job(job_id := v_jobid, active := false);
  end if;
end
$$;
