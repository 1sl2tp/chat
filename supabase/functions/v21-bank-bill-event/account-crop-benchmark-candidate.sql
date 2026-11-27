-- Private, explicitly seeded one-shot benchmark. No financial mutations.
begin;
create table v0_private.bill_account_crop_benchmark(
 receipt_id uuid primary key, raw_hash text not null, image_sha256 text not null,
 state text not null default 'queued' check(state in ('queued','running','verified','needs_review','failed','stale')),
 lease_id uuid, lease_until timestamptz, result jsonb, updated_at timestamptz not null default now()
);
alter table v0_private.bill_account_crop_benchmark enable row level security;
revoke all on v0_private.bill_account_crop_benchmark from public,anon,authenticated,service_role;
create function public.v0_bill_crop_benchmark_claim() returns jsonb language plpgsql security definer set search_path='' as $f$
declare j v0_private.bill_account_crop_benchmark; r public.chat_bank_bill_receipts; a public.v21_media_assets;
begin
 if public.v0_bill_focus_mode()<>'pilot' then return null;end if;
 perform pg_advisory_xact_lock(75638129);
 update v0_private.bill_account_crop_benchmark set state='failed',lease_id=null,lease_until=null,updated_at=now() where state='running' and lease_until<=now();
 if exists(select 1 from v0_private.bill_account_crop_benchmark where state='running') or exists(select 1 from v0_private.bill_focused_reread where state='running' and lease_until>now()) then return null;end if;
 select * into j from v0_private.bill_account_crop_benchmark where state='queued' order by receipt_id limit 1 for update skip locked;
 if not found then return null;end if;
 select * into r from public.chat_bank_bill_receipts where id=j.receipt_id and status='received' and ledger_id is not null and sent_at>='2026-11-27T00:00:00+07' and sent_at<'2026-11-28T00:00:00+07' and raw_read->>'transfer_success_visible'='true' and md5(raw_read::text)=j.raw_hash and image_sha256=j.image_sha256;
 if found then select * into a from public.v21_media_assets where id=r.media_asset_id and message_id=r.message_id and owner_account_id=r.customer_account_id and deleted_at is null;end if;
 if r.id is null or a.id is null then update v0_private.bill_account_crop_benchmark set state='stale',updated_at=now() where receipt_id=j.receipt_id;return null;end if;
 update v0_private.bill_account_crop_benchmark set state='running',lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now() where receipt_id=j.receipt_id returning * into j;
 return jsonb_build_object('id',j.receipt_id,'lease_id',j.lease_id,'region',r.raw_read->'recipient_account_region','image_sha256',r.image_sha256,'storage_key',a.storage_key,'mime_type',a.mime_type);
end $f$;
create function public.v0_bill_crop_benchmark_finish(p_id uuid,p_lease uuid,p_state text,p_result jsonb) returns text language plpgsql security definer set search_path='' as $f$
declare j v0_private.bill_account_crop_benchmark; target text;
begin
 select * into j from v0_private.bill_account_crop_benchmark where receipt_id=p_id for update;
 if not found or j.state<>'running' or j.lease_id is distinct from p_lease or j.lease_until<=now() then return 'stale';end if;
 if p_state is null or p_state not in ('verified','needs_review','failed') or p_result is null or jsonb_typeof(p_result)<>'object' or pg_column_size(p_result)>256 or jsonb_typeof(p_result->'crop_used') is distinct from 'boolean' or jsonb_typeof(p_result->'exact') is distinct from 'boolean' or coalesce(p_result->>'requests','') not in ('0','1','2') or exists(select 1 from jsonb_object_keys(p_result) k where k not in ('crop_used','exact','requests')) or ((p_state='verified') is distinct from (p_result->>'exact'='true')) then raise exception 'invalid_benchmark_result';end if;
 target:=p_state;
 if not exists(select 1 from public.chat_bank_bill_receipts r join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null where r.id=p_id and r.status='received' and r.ledger_id is not null and md5(r.raw_read::text)=j.raw_hash and r.image_sha256=j.image_sha256) then target:='stale';end if;
 update v0_private.bill_account_crop_benchmark set state=target,result=case when target='stale' then null else p_result end,lease_id=null,lease_until=null,updated_at=now() where receipt_id=p_id;
 return target;
end $f$;
revoke all on function public.v0_bill_crop_benchmark_claim(),public.v0_bill_crop_benchmark_finish(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.v0_bill_crop_benchmark_claim(),public.v0_bill_crop_benchmark_finish(uuid,uuid,text,jsonb) to service_role;
commit;
