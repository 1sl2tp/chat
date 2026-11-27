-- Candidate only. Create the dispatcher after the queue and edge release are accepted.
-- Activation is a separate operator action: cron.schedule('v0-bill-focused-reread-5m','*/5 * * * *','select v0_private.bill_focus_dispatch();')
-- Rollback: unschedule by exact job name, disable Edge flag; retain evidence.
begin;
create function v0_private.bill_focus_dispatch() returns bigint
language plpgsql security definer set search_path='' as $dispatch$
declare k text; req bigint;
begin
 perform pg_advisory_xact_lock(75638130);
 -- Seed at most 20; no traffic when idle. Never touch the financial retry schedule.
 perform public.v0_bill_focus_seed(20);
 if exists(select 1 from v0_private.bill_focused_reread where state='running' and lease_until>now()) then return null;end if;
 if not exists(select 1 from v0_private.bill_focused_reread where attempts<2 and ((state in ('queued','retry') and next_at<=now()) or (state='running' and lease_until<=now()))) then return null;end if;
 select scan_key into k from public.chat_customer_summary_runtime_config();
 if k is null or length(k)<16 then return null;end if;
 select net.http_post(url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-bank-bill-event',
 headers:=jsonb_build_object('content-type','application/json','x-internal-dispatch-key',k),
 body:='{"action":"focused_reread"}'::jsonb,timeout_milliseconds:=45000) into req;
 return req;
end $dispatch$;
revoke all on function v0_private.bill_focus_dispatch() from public,anon,authenticated,service_role;
commit;
