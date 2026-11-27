-- Disposable PG only.
create role anon;
create role authenticated;
create role service_role;
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

-- Exercise the actual fenced candidate, not only the attempt primitive.
alter table public.v21_push_outbox add column available_at timestamptz default now(),add column last_error text;
alter table public.chat_bank_admin_push_outbox add column available_at timestamptz default now(),add column last_error text;
create function public.v21_admin_push_claim(p_limit integer) returns table(outbox_id uuid,attempt_count integer) language sql as $$
 with picked as(select id from public.v21_push_outbox where state in('pending','retry') and available_at<=now() order by id limit p_limit for update skip locked)
 update public.v21_push_outbox q set state='processing',attempt_count=q.attempt_count+1,updated_at=now() from picked where q.id=picked.id returning q.id,q.attempt_count
$$;
create function public.chat_bank_admin_push_claim(p_limit integer) returns setof public.chat_bank_admin_push_outbox language sql as $$
 with picked as(select id from public.chat_bank_admin_push_outbox where state in('pending','retry') and available_at<=now() order by id limit p_limit for update skip locked)
 update public.chat_bank_admin_push_outbox q set state='processing',attempt_count=q.attempt_count+1,updated_at=now() from picked where q.id=picked.id returning q.*
$$;
\ir push-fenced-candidate.sql
do $$
declare target constant uuid:='00000000-0000-4000-8000-000000000011'; bank constant uuid:='00000000-0000-4000-8000-000000000012'; rows jsonb; tok uuid; bt uuid;
begin
 insert into public.v21_push_outbox(id,state,attempt_count,updated_at) values(target,'pending',0,now());
 insert into public.chat_bank_admin_push_outbox(id,state,attempt_count,updated_at) values(bank,'pending',0,now());
 rows:=v21_private.push_claim_fenced('chat',1);
 if jsonb_array_length(rows)<>1 or rows->0->>'outbox_id'<>target::text then raise exception 'chat claim identity'; end if;
 if (select state from public.chat_bank_admin_push_outbox where id=bank)<>'pending' then raise exception 'cross-family claim'; end if;
 tok:=(rows->0->>'attempt_token')::uuid;
 if not v21_private.push_delivery_attempt_begin('chat',target,1,tok) then raise exception 'dispatch'; end if;
 if v21_private.push_finish_fenced('chat',target,2,tok,'confirmed') then raise exception 'stale result'; end if;
 if not v21_private.push_finish_fenced('chat',target,1,tok,'unknown') then raise exception 'unknown ACK'; end if;
 if (select state from public.v21_push_outbox where id=target)<>'processing' then raise exception 'unknown replay'; end if;
 if jsonb_array_length(v21_private.push_claim_fenced('chat',10))<>0 then raise exception 'unknown reclaimed'; end if;
 rows:=v21_private.push_claim_fenced('bank_admin',1);bt:=(rows->0->>'attempt_token')::uuid;
 if rows->0->>'id'<>bank::text then raise exception 'bank identity'; end if;
 if not v21_private.push_finish_fenced('bank_admin',bank,1,bt,'not_sent',false) then raise exception 'preflight fail'; end if;
 if (select state from public.chat_bank_admin_push_outbox where id=bank)<>'retry' then raise exception 'safe retry'; end if;
 update public.chat_bank_admin_push_outbox set available_at=now() where id=bank;
 rows:=v21_private.push_claim_fenced('bank_admin',1);
 tok:=(rows->0->>'attempt_token')::uuid;
 if tok=bt or v21_private.push_finish_fenced('bank_admin',bank,1,bt,'confirmed') then raise exception 'old attempt accepted'; end if;
 if not v21_private.push_delivery_attempt_begin('bank_admin',bank,2,tok) then raise exception 'bank dispatch'; end if;
 if not v21_private.push_finish_fenced('bank_admin',bank,2,tok,'confirmed') then raise exception 'bank ACK'; end if;
 if (select state from public.chat_bank_admin_push_outbox where id=bank)<>'sent' then raise exception 'bank not sent'; end if;
 if has_function_privilege('authenticated','v21_private.push_claim_fenced(text,integer)','execute') then raise exception 'browser claim'; end if;
 raise notice 'fenced claim and completion fixture passed';
end $$;

do $$
begin
 if has_function_privilege('anon','public.v21_push_claim_fenced(text,integer)','execute')
 or has_function_privilege('authenticated','public.v21_push_begin_fenced(text,uuid,integer,uuid)','execute')
 or has_function_privilege('authenticated','public.v21_push_finish_fenced(text,uuid,integer,uuid,text,boolean)','execute')
 or not has_function_privilege('service_role','public.v21_push_claim_fenced(text,integer)','execute')
 then raise exception 'worker RPC grant'; end if;
end $$;
