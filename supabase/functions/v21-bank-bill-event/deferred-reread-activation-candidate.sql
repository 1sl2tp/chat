-- Candidate activation migration: default OFF. No automatic activation.
begin;
create table v0_private.bill_focus_control (
 singleton boolean primary key default true check(singleton),
 mode text not null default 'off' check(mode in ('off','pilot','auto'))
);
insert into v0_private.bill_focus_control default values;
create table v0_private.bill_focus_pilot_receipt(receipt_id uuid primary key);
alter table v0_private.bill_focus_control enable row level security;
alter table v0_private.bill_focus_pilot_receipt enable row level security;
revoke all on v0_private.bill_focus_control,v0_private.bill_focus_pilot_receipt from public,anon,authenticated,service_role;
create function public.v0_bill_focus_mode() returns text language sql stable security definer set search_path='' as $gate$
 select coalesce((select mode from v0_private.bill_focus_control where singleton),'off')
$gate$;
revoke all on function public.v0_bill_focus_mode() from public,anon,authenticated,service_role;
grant execute on function public.v0_bill_focus_mode() to service_role;
create function v0_private.bill_focus_allowed(p_receipt uuid) returns boolean language sql stable security definer set search_path='' as $gate$
 select exists(select 1 from public.chat_bank_bill_receipts r where r.id=p_receipt and (
 (public.v0_bill_focus_mode()='pilot' and r.ledger_id is not null and exists(select 1 from v0_private.bill_focus_pilot_receipt p where p.receipt_id=r.id))
 or (public.v0_bill_focus_mode()='auto' and r.sent_at>='2026-11-23T09:58:11Z'::timestamptz)))
$gate$;
revoke all on function v0_private.bill_focus_allowed(uuid) from public,anon,authenticated,service_role;
create or replace function public.v0_bill_focus_seed(p_limit integer default 20) returns integer
language plpgsql security definer set search_path='' as $q$
declare n integer;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_limit';end if;
 insert into v0_private.bill_focused_reread(receipt_id,raw_hash,image_sha256,field)
 select r.id,md5(r.raw_read::text),r.image_sha256,f.field
 from public.chat_bank_bill_receipts r
 join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null
 cross join (values ('account'),('small_text')) f(field)
 where v0_private.bill_focus_allowed(r.id) and r.status in ('received','amount_read','review','duplicate') and r.image_sha256 ~ '^[a-f0-9]{64}$'
 and r.raw_read->>'transfer_success_visible'='true'
 and ((f.field='account' and v0_private.bill_focus_retryable(r.raw_read->>'account_digit_recheck_state'))
 or (f.field='small_text' and v0_private.bill_focus_retryable(r.raw_read->>'small_text_recheck_state')))
 and not exists(select 1 from v0_private.bill_focused_reread q where q.receipt_id=r.id and q.raw_hash=md5(r.raw_read::text) and q.field=f.field)
 order by case when f.field='account' then 0 else 1 end,r.sent_at desc nulls last,r.id
 limit p_limit on conflict(receipt_id,raw_hash,field) do nothing;
 get diagnostics n=row_count;return n;
end $q$;
create or replace function public.v0_bill_focus_claim() returns jsonb
language plpgsql security definer set search_path='' as $q$
declare j v0_private.bill_focused_reread; r public.chat_bank_bill_receipts; a public.v21_media_assets;
begin
 update v0_private.bill_focused_reread set state='needs_review',lease_id=null,lease_until=null,updated_at=now() where state='running' and lease_until<=now() and attempts>=2;
 -- One outstanding AI job globally; serialize claim decisions even across workers.
 perform pg_advisory_xact_lock(75638129);
 if exists(select 1 from v0_private.bill_focused_reread where state='running' and lease_until>now()) then return null;end if;
 select * into j from v0_private.bill_focused_reread where v0_private.bill_focus_allowed(receipt_id) and attempts<2 and ((state in ('queued','retry') and next_at<=now()) or (state='running' and lease_until<=now())) order by case when field='account' then 0 else 1 end,next_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 select * into r from public.chat_bank_bill_receipts where id=j.receipt_id and md5(raw_read::text)=j.raw_hash and image_sha256=j.image_sha256 and status in ('received','amount_read','review','duplicate');
 if found then select * into a from public.v21_media_assets where id=r.media_asset_id and message_id=r.message_id and owner_account_id=r.customer_account_id and deleted_at is null;end if;
 if r.id is null or a.id is null then update v0_private.bill_focused_reread set state='stale',lease_id=null,lease_until=null,updated_at=now() where id=j.id;return null;end if;
 update v0_private.bill_focused_reread set state='running',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now() where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'lease_id',j.lease_id,'field',j.field,'raw',r.raw_read,'image_sha256',j.image_sha256,'storage_key',a.storage_key,'mime_type',a.mime_type);
end $q$;
create or replace function v0_private.bill_focus_dispatch() returns bigint
language plpgsql security definer set search_path='' as $dispatch$
declare k text; req bigint;
begin
 if public.v0_bill_focus_mode() not in ('pilot','auto') then return null;end if;
 perform pg_advisory_xact_lock(75638130);
 -- Seed at most 20; no traffic when idle. Never touch the financial retry schedule.
 perform public.v0_bill_focus_seed(20);
 if exists(select 1 from v0_private.bill_focused_reread where state='running' and lease_until>now()) then return null;end if;
 if not exists(select 1 from v0_private.bill_focused_reread where v0_private.bill_focus_allowed(receipt_id) and attempts<2 and ((state in ('queued','retry') and next_at<=now()) or (state='running' and lease_until<=now()))) then return null;end if;
 select scan_key into k from public.chat_customer_summary_runtime_config();
 if k is null or length(k)<16 then return null;end if;
 select net.http_post(url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-bank-bill-event',
 headers:=jsonb_build_object('content-type','application/json','x-internal-dispatch-key',k),
 body:='{"action":"focused_reread"}'::jsonb,timeout_milliseconds:=45000) into req;
 return req;
end $dispatch$;
commit;
