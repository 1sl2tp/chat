-- Candidate: private cache of crop coordinates only. No financial changes.
begin;
create table v0_private.bill_account_region_cache(
 receipt_id uuid not null, image_sha256 text not null check(image_sha256 ~ '^[a-f0-9]{64}$'),
 version integer not null check(version=1), region jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(receipt_id,image_sha256,version)
);
alter table v0_private.bill_account_region_cache enable row level security;
revoke all on v0_private.bill_account_region_cache from public,anon,authenticated,service_role;
create function v0_private.bill_account_region_cache_scope(p_kind text,p_id uuid,p_lease uuid,p_sha text,p_version integer) returns uuid
language plpgsql set search_path='' as $f$
declare rid uuid; rh text; until_at timestamptz;
begin
 if p_version is distinct from 1 or p_sha is null or p_sha !~ '^[a-f0-9]{64}$' or p_lease is null then return null;end if;
 if p_kind='benchmark' and public.v0_bill_focus_mode()='pilot' then
  select receipt_id,raw_hash,lease_until into rid,rh,until_at from v0_private.bill_account_crop_benchmark where receipt_id=p_id and lease_id=p_lease and lease_until>clock_timestamp() and state='running' and image_sha256=p_sha for update;
 elsif p_kind='focused' and public.v0_bill_focus_mode() in ('pilot','auto') then
  select receipt_id,raw_hash,lease_until into rid,rh,until_at from v0_private.bill_focused_reread where id=p_id and lease_id=p_lease and lease_until>clock_timestamp() and state='running' and field='account' and image_sha256=p_sha and v0_private.bill_focus_allowed(receipt_id) for update;
 end if;
 if rid is null or until_at<=clock_timestamp() or not exists(select 1 from public.chat_bank_bill_receipts r join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null where r.id=rid and r.image_sha256=p_sha and md5(r.raw_read::text)=rh and r.raw_read->>'transfer_success_visible'='true' and r.status in ('received','amount_read','review','duplicate') and (p_kind<>'benchmark' or (r.status='received' and r.ledger_id is not null))) then return null;end if;
 return rid;
end $f$;
revoke all on function v0_private.bill_account_region_cache_scope(text,uuid,uuid,text,integer) from public,anon,authenticated,service_role;
create function public.v0_bill_account_region_cache_get(p_kind text,p_id uuid,p_lease uuid,p_sha text,p_version integer) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='500ms' as $f$
declare rid uuid; box jsonb;
begin
 rid:=v0_private.bill_account_region_cache_scope(p_kind,p_id,p_lease,p_sha,p_version);
 select region into box from v0_private.bill_account_region_cache where receipt_id=rid and image_sha256=p_sha and version=p_version and updated_at>now()-interval '7 days';
 return box;
end $f$;
create function public.v0_bill_account_region_cache_put(p_kind text,p_id uuid,p_lease uuid,p_sha text,p_version integer,p_region jsonb) returns boolean
language plpgsql security definer set search_path='' set lock_timeout='500ms' as $f$
declare rid uuid; y0 int;x0 int;y1 int;x1 int;
begin
 rid:=v0_private.bill_account_region_cache_scope(p_kind,p_id,p_lease,p_sha,p_version);
 if rid is null or p_region is null or jsonb_typeof(p_region)<>'object' or pg_column_size(p_region)>256 or p_region->>'role' is distinct from 'recipient_account' or jsonb_typeof(p_region->'box') is distinct from 'array' then return false;end if;
 if jsonb_array_length(p_region->'box')<>4 or exists(select 1 from jsonb_object_keys(p_region) k where k not in ('role','box')) then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_region->'box') v where jsonb_typeof(v)<>'number' or v::text !~ '^(0|[1-9][0-9]{0,2}|1000)$') then return false;end if;
 y0:=(p_region->'box'->>0)::int;x0:=(p_region->'box'->>1)::int;y1:=(p_region->'box'->>2)::int;x1:=(p_region->'box'->>3)::int;
 if y1-y0 not between 8 and 220 or x1-x0 not between 70 and 950 then return false;end if;
 insert into v0_private.bill_account_region_cache(receipt_id,image_sha256,version,region) values(rid,p_sha,p_version,p_region)
 on conflict(receipt_id,image_sha256,version) do update set region=excluded.region,updated_at=now();
 return true;
end $f$;
create function public.v0_bill_account_region_cache_remove(p_kind text,p_id uuid,p_lease uuid,p_sha text,p_version integer) returns boolean
language plpgsql security definer set search_path='' set lock_timeout='500ms' as $f$
declare rid uuid;
begin
 rid:=v0_private.bill_account_region_cache_scope(p_kind,p_id,p_lease,p_sha,p_version);
 if rid is null then return false;end if;
 delete from v0_private.bill_account_region_cache where receipt_id=rid and image_sha256=p_sha and version=p_version;
 return found;
end $f$;
revoke all on function public.v0_bill_account_region_cache_get(text,uuid,uuid,text,integer),public.v0_bill_account_region_cache_put(text,uuid,uuid,text,integer,jsonb),public.v0_bill_account_region_cache_remove(text,uuid,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.v0_bill_account_region_cache_get(text,uuid,uuid,text,integer),public.v0_bill_account_region_cache_put(text,uuid,uuid,text,integer,jsonb),public.v0_bill_account_region_cache_remove(text,uuid,uuid,text,integer) to service_role;
commit;
