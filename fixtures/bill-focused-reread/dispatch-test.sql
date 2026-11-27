\set ON_ERROR_STOP on
-- Runs after isolated queue fixture. Never reaches network.
create schema net;
create table public.fixture_http(id bigint generated always as identity, body jsonb);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language plpgsql as $fake$
declare v bigint;
begin
 if url not like 'https://%/functions/v1/v21-bank-bill-event' or body is distinct from '{"action":"focused_reread"}'::jsonb or timeout_milliseconds<>45000 or headers->>'x-internal-dispatch-key' is distinct from 'fixture-dispatch-key' then raise exception 'dispatch scope';end if;
 insert into public.fixture_http(body) values(body) returning id into v;return v;
end $fake$;
create function public.chat_customer_summary_runtime_config() returns table(scan_key text) language sql as $fake$ select 'fixture-dispatch-key'::text $fake$;
\ir ../../supabase/functions/v21-bank-bill-event/deferred-reread-dispatch-candidate.sql
do $test$
declare j jsonb;
begin
 if has_function_privilege('authenticated','v0_private.bill_focus_dispatch()','execute') or has_function_privilege('anon','v0_private.bill_focus_dispatch()','execute') then raise exception 'dispatch grant';end if;
 if v0_private.bill_focus_dispatch() is not null then raise exception 'idle dispatch';end if;
 update v0_private.bill_focused_reread set state='queued',attempts=0,next_at=now() where field='account';
 if v0_private.bill_focus_dispatch() is null or (select count(*) from public.fixture_http)<>1 then raise exception 'missing dispatch';end if;
 j:=public.v0_bill_focus_claim();
 if j is null or v0_private.bill_focus_dispatch() is not null or (select count(*) from public.fixture_http)<>1 then raise exception 'busy dispatch';end if;
 raise notice 'Focused dispatcher idle/busy/permission fixture passed';
end $test$;
