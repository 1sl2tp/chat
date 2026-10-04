-- Bound non-canonical Chat operational tables.
-- Canonical messages/read-state/conversations/media are intentionally untouched.
-- The cleanup is bounded per table and runs once daily.

create or replace function v21_private.chat_operational_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','cron'
as $function$
declare
  v_sync integer := 0;
  v_session_events integer := 0;
  v_push integer := 0;
  v_sessions integer := 0;
  v_summary integer := 0;
begin
  with doomed as (
    select ctid
    from public.v21_sync_events
    where created_at < now() - interval '14 days'
    order by created_at
    limit 10000
  )
  delete from public.v21_sync_events t
  using doomed d
  where t.ctid=d.ctid;
  get diagnostics v_sync=row_count;

  with doomed as (
    select ctid
    from public.v21_session_events
    where created_at < now() - interval '7 days'
    order by created_at
    limit 10000
  )
  delete from public.v21_session_events t
  using doomed d
  where t.ctid=d.ctid;
  get diagnostics v_session_events=row_count;

  with doomed as (
    select ctid
    from public.v21_push_outbox
    where state in ('sent','dead')
      and updated_at < now() - interval '7 days'
    order by updated_at
    limit 10000
  )
  delete from public.v21_push_outbox t
  using doomed d
  where t.ctid=d.ctid;
  get diagnostics v_push=row_count;

  with doomed as (
    select ctid
    from public.v21_sessions
    where revoked_at is not null
      and revoked_at < now() - interval '30 days'
    order by revoked_at
    limit 10000
  )
  delete from public.v21_sessions t
  using doomed d
  where t.ctid=d.ctid;
  get diagnostics v_sessions=row_count;

  with doomed as (
    select ctid
    from public.chat_customer_summary_runs
    where (status='failed' and finished_at < now() - interval '7 days')
       or (status='done' and finished_at < now() - interval '30 days')
    order by finished_at
    limit 10000
  )
  delete from public.chat_customer_summary_runs t
  using doomed d
  where t.ctid=d.ctid;
  get diagnostics v_summary=row_count;

  return jsonb_build_object(
    'sync_events',v_sync,
    'session_events',v_session_events,
    'push_outbox',v_push,
    'revoked_sessions',v_sessions,
    'summary_runs',v_summary
  );
end;
$function$;

revoke all on function v21_private.chat_operational_retention_cleanup()
from public,anon,authenticated;
grant execute on function v21_private.chat_operational_retention_cleanup()
to postgres,service_role;

do $$
declare
  j record;
begin
  for j in
    select jobid from cron.job where jobname='chat-operational-retention-daily'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'chat-operational-retention-daily',
  '43 3 * * *',
  'select v21_private.chat_operational_retention_cleanup();'
);

-- One bounded cleanup at migration time.
select v21_private.chat_operational_retention_cleanup();

-- Rollback for the scheduler/function (deleted operational rows are intentionally
-- disposable and are not canonical product data):
-- select cron.unschedule(jobid) from cron.job where jobname='chat-operational-retention-daily';
-- drop function if exists v21_private.chat_operational_retention_cleanup();
