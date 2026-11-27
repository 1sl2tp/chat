-- DELIVERY-ACK-ROOT-01 / #452: isolated candidate only; no existing queue migration.
-- Durable attempt records are separate from the current outbox. Old processing
-- rows have unknown provider outcome and MUST NOT be made retryable by age.
begin;
create table if not exists v21_private.push_delivery_attempt(
 family text not null check(family in ('chat','bank_admin')),
 outbox_id uuid not null,
 attempt_no integer not null check(attempt_no>0),
 token uuid not null unique,
 phase text not null check(phase in ('claimed','dispatching','confirmed','not_sent','unknown')),
 lease_until timestamptz not null,
 updated_at timestamptz not null default now(),
 primary key(family,outbox_id,attempt_no)
);
alter table v21_private.push_delivery_attempt enable row level security;
revoke all on v21_private.push_delivery_attempt from public,anon,authenticated;
-- Only the backend worker may use a token; never trust browser ACK.
create or replace function v21_private.push_delivery_attempt_begin(p_family text,p_id uuid,p_attempt integer,p_token uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare changed integer;
begin
 update v21_private.push_delivery_attempt a set phase='dispatching',updated_at=now()
 where a.family=p_family and a.outbox_id=p_id and a.attempt_no=p_attempt and a.token=p_token
  and a.phase='claimed' and a.lease_until>now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;
create or replace function v21_private.push_delivery_attempt_finish(p_family text,p_id uuid,p_attempt integer,p_token uuid,p_outcome text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare changed integer;
begin
 if p_outcome not in ('confirmed','not_sent','unknown') or p_outcome is null then return false; end if;
 update v21_private.push_delivery_attempt a set phase=p_outcome,updated_at=now()
 where a.family=p_family and a.outbox_id=p_id and a.attempt_no=p_attempt and a.token=p_token
  and a.phase='dispatching' and a.lease_until>now();
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function v21_private.push_delivery_attempt_begin(text,uuid,integer,uuid) from public,anon,authenticated;
revoke all on function v21_private.push_delivery_attempt_finish(text,uuid,integer,uuid,text) from public,anon,authenticated;
-- Read-only diagnostic, deliberately no requeue. Missing attempt proof => review.
create or replace function v21_private.push_delivery_recovery_audit()
returns table(family text,outbox_id uuid,attempt_no integer,decision text)
language sql stable security invoker set search_path=''
as $$
 with stuck as (
 select 'chat'::text family,id,attempt_count from public.v21_push_outbox
 where state='processing' and updated_at<now()-interval '1 hour'
 union all
 select 'bank_admin',id,attempt_count from public.chat_bank_admin_push_outbox
 where state='processing' and updated_at<now()-interval '1 hour'
 )
 select s.family,s.id,s.attempt_count,
 case when a.phase='confirmed' then 'verify_ack'
      when a.phase='not_sent' then 'verify_retry'
      when a.phase='claimed' and a.lease_until<now() then 'verify_unsent'
      else 'review_unknown' end
 from stuck s left join v21_private.push_delivery_attempt a
 on a.family=s.family and a.outbox_id=s.id and a.attempt_no=s.attempt_count
$$;
revoke all on function v21_private.push_delivery_recovery_audit() from public,anon,authenticated;
commit;
