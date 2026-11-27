-- Disposable PG only.
create role anon;
create role authenticated;
create schema v21_private;
create table public.v21_push_outbox(id uuid primary key,state text,attempt_count integer,updated_at timestamptz);
create table public.chat_bank_admin_push_outbox(like public.v21_push_outbox including all);
\ir push-attempt-candidate.sql
do $$
declare target constant uuid:='00000000-0000-4000-8000-000000000001'; tok constant uuid:='00000000-0000-4000-8000-000000000002'; other constant uuid:='00000000-0000-4000-8000-000000000003';
begin
 insert into public.v21_push_outbox values(target,'processing',2,now()-interval '2 hours');
 if (select decision from v21_private.push_delivery_recovery_audit())<>'review_unknown' then raise exception 'legacy replay risk'; end if;
 insert into v21_private.push_delivery_attempt(family,outbox_id,attempt_no,token,phase,lease_until) values('chat',target,2,tok,'claimed',now()+interval '3 minutes');
 if v21_private.push_delivery_attempt_begin('chat',target,2,other) then raise exception 'wrong token'; end if;
 if not v21_private.push_delivery_attempt_begin('chat',target,2,tok) then raise exception 'begin'; end if;
 if v21_private.push_delivery_attempt_begin('chat',target,2,tok) then raise exception 'duplicate dispatch'; end if;
 if (select decision from v21_private.push_delivery_recovery_audit())<>'review_unknown' then raise exception 'ambiguous dispatch'; end if;
 if v21_private.push_delivery_attempt_finish('chat',target,1,tok,'confirmed') then raise exception 'stale attempt'; end if;
 if not v21_private.push_delivery_attempt_finish('chat',target,2,tok,'confirmed') then raise exception 'finish'; end if;
 if v21_private.push_delivery_attempt_finish('chat',target,2,tok,'not_sent') then raise exception 'duplicate ACK'; end if;
 if (select decision from v21_private.push_delivery_recovery_audit())<>'verify_ack' then raise exception 'confirmed'; end if;
 if (select state from public.v21_push_outbox where v21_push_outbox.id=target)<>'processing' then raise exception 'audit writes'; end if;
 if has_function_privilege('authenticated','v21_private.push_delivery_attempt_begin(text,uuid,integer,uuid)','execute') then raise exception 'client can dispatch'; end if;
end $$;
