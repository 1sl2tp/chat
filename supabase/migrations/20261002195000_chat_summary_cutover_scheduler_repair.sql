-- Post-cutover AI scheduler repair.
-- Only invoke the summary worker when dirty work exists. Failed summaries are
-- throttled for six hours so provider/rate-limit errors cannot create a hot loop.
create or replace function public.chat_customer_summary_enqueue_if_needed()
returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
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

  return public.chat_customer_summary_scan_enqueue_http();
end;
$$;

revoke all on function public.chat_customer_summary_enqueue_if_needed() from public,anon,authenticated;
grant execute on function public.chat_customer_summary_enqueue_if_needed() to postgres,service_role;

do $$
declare j record;
begin
  for j in
    select jobid
    from cron.job
    where jobname in ('chat-customer-summary-scan-1m','chat-customer-summary-scan-5m','chat-ai-order-scan-15m')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'chat-customer-summary-scan-5m',
  '*/5 * * * *',
  'select public.chat_customer_summary_enqueue_if_needed();'
);