-- Candidate only: private display evidence, no financial writes.
begin;
create schema if not exists v0_private;
create table v0_private.bill_focused_reread (
 id uuid primary key default gen_random_uuid(),
 receipt_id uuid not null, raw_hash text not null, image_sha256 text not null,
 field text not null check(field in ('account','small_text')),
 state text not null default 'queued' check(state in ('queued','running','retry','verified','needs_review','stale')),
 attempts int not null default 0 check(attempts between 0 and 2),
 next_at timestamptz not null default now(), lease_id uuid, lease_until timestamptz,
 evidence jsonb, updated_at timestamptz not null default now(),
 unique(receipt_id,raw_hash,field)
);
alter table v0_private.bill_focused_reread enable row level security;
revoke all on v0_private.bill_focused_reread from public,anon,authenticated,service_role;
create index bill_focused_reread_claim_idx on v0_private.bill_focused_reread(state,next_at);
create function v0_private.bill_focus_retryable(s text) returns boolean language sql immutable set search_path='' as $q$
select coalesce(s in ('timeout','budget_exhausted','request_failed','invalid_json','gemini_http_502','gemini_http_503','gemini_http_504'),false)
$q$;
revoke all on function v0_private.bill_focus_retryable(text) from public,anon,authenticated,service_role;
create function public.v0_bill_focus_seed(p_limit integer default 20) returns integer
language plpgsql security definer set search_path='' as $q$
declare n integer;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_limit';end if;
 insert into v0_private.bill_focused_reread(receipt_id,raw_hash,image_sha256,field)
 select r.id,md5(r.raw_read::text),r.image_sha256,f.field
 from public.chat_bank_bill_receipts r
 join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null
 cross join (values ('account'),('small_text')) f(field)
 where r.status in ('received','amount_read','review','duplicate') and r.image_sha256 ~ '^[a-f0-9]{64}$'
 and r.raw_read->>'transfer_success_visible'='true'
 and ((f.field='account' and v0_private.bill_focus_retryable(r.raw_read->>'account_digit_recheck_state'))
 or (f.field='small_text' and v0_private.bill_focus_retryable(r.raw_read->>'small_text_recheck_state')))
 and not exists(select 1 from v0_private.bill_focused_reread q where q.receipt_id=r.id and q.raw_hash=md5(r.raw_read::text) and q.field=f.field)
 order by case when f.field='account' then 0 else 1 end,r.sent_at desc nulls last,r.id
 limit p_limit on conflict(receipt_id,raw_hash,field) do nothing;
 get diagnostics n=row_count;return n;
end $q$;
create function public.v0_bill_focus_claim() returns jsonb
language plpgsql security definer set search_path='' as $q$
declare j v0_private.bill_focused_reread; r public.chat_bank_bill_receipts; a public.v21_media_assets;
begin
 update v0_private.bill_focused_reread set state='needs_review',lease_id=null,lease_until=null,updated_at=now() where state='running' and lease_until<=now() and attempts>=2;
 -- One outstanding AI job globally; serialize claim decisions even across workers.
 perform pg_advisory_xact_lock(75638129);
 if exists(select 1 from v0_private.bill_focused_reread where state='running' and lease_until>now()) then return null;end if;
 select * into j from v0_private.bill_focused_reread where attempts<2 and ((state in ('queued','retry') and next_at<=now()) or (state='running' and lease_until<=now())) order by case when field='account' then 0 else 1 end,next_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 select * into r from public.chat_bank_bill_receipts where id=j.receipt_id and md5(raw_read::text)=j.raw_hash and image_sha256=j.image_sha256 and status in ('received','amount_read','review','duplicate');
 if found then select * into a from public.v21_media_assets where id=r.media_asset_id and message_id=r.message_id and owner_account_id=r.customer_account_id and deleted_at is null;end if;
 if r.id is null or a.id is null then update v0_private.bill_focused_reread set state='stale',lease_id=null,lease_until=null,updated_at=now() where id=j.id;return null;end if;
 update v0_private.bill_focused_reread set state='running',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now() where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'lease_id',j.lease_id,'field',j.field,'raw',r.raw_read,'image_sha256',j.image_sha256,'storage_key',a.storage_key,'mime_type',a.mime_type);
end $q$;
create function public.v0_bill_focus_finish(p_id uuid,p_lease uuid,p_state text,p_evidence jsonb default null) returns text
language plpgsql security definer set search_path='' as $q$
declare j v0_private.bill_focused_reread; target text;
begin
 select * into j from v0_private.bill_focused_reread where id=p_id for update;
 if not found or j.state<>'running' or j.lease_id is distinct from p_lease or j.lease_until<=now() then return 'stale';end if;
 if p_state is null or p_state not in ('verified','needs_review','retry','stale') then raise exception 'invalid_state';end if;
 target:=p_state;
 if not exists(select 1 from public.chat_bank_bill_receipts r join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null where r.id=j.receipt_id and md5(r.raw_read::text)=j.raw_hash and r.image_sha256=j.image_sha256) then target:='stale';end if;
 if target='retry' and j.attempts>=2 then target:='needs_review';end if;
 if target='verified' then
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or pg_column_size(p_evidence)>4096 or p_evidence='{}'::jsonb then raise exception 'invalid_evidence';end if;
  if j.field='account' then
   if p_evidence->'account'->>'source' is distinct from 'independent_focused_vision' or p_evidence->'account'->>'digit_count' is distinct from '13' or p_evidence->'account'->>'trailing_nines' is distinct from '6' then raise exception 'invalid_account_evidence';end if;
  elsif exists(select 1 from jsonb_object_keys(p_evidence) k where k not in ('date','clock','memo')) then raise exception 'invalid_small_text_evidence';
  end if;
 end if;
 update v0_private.bill_focused_reread set state=target,evidence=case when target='verified' then p_evidence else null end,next_at=now()+interval '5 minutes',lease_id=null,lease_until=null,updated_at=now() where id=j.id;
 return target;
end $q$;
revoke all on function public.v0_bill_focus_seed(integer),public.v0_bill_focus_claim(),public.v0_bill_focus_finish(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.v0_bill_focus_seed(integer),public.v0_bill_focus_claim(),public.v0_bill_focus_finish(uuid,uuid,text,jsonb) to service_role;
commit;
