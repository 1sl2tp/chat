-- Source-only additive candidate; apply after benchmark and cache migrations, not before release review.
begin;
create or replace function public.v0_bill_crop_benchmark_finish(p_id uuid,p_lease uuid,p_state text,p_result jsonb) returns text language plpgsql security definer set search_path='' as $f$
declare j v0_private.bill_account_crop_benchmark; target text;
begin
 select * into j from v0_private.bill_account_crop_benchmark where receipt_id=p_id for update;
 if not found or j.state<>'running' or j.lease_id is distinct from p_lease or j.lease_until<=now() then return 'stale';end if;
 if p_state is null or p_state not in ('verified','needs_review','failed') or p_result is null or jsonb_typeof(p_result)<>'object' or pg_column_size(p_result)>1024 or jsonb_typeof(p_result->'crop_used') is distinct from 'boolean' or jsonb_typeof(p_result->'exact') is distinct from 'boolean' or coalesce(p_result->>'requests','') not in ('0','1','2') or exists(select 1 from jsonb_object_keys(p_result) k where k not in ('crop_used','exact','requests','metrics')) or ((p_state='verified') is distinct from (p_result->>'exact'='true')) then raise exception 'invalid_benchmark_result';end if;
 if p_result ? 'metrics' then
  if jsonb_typeof(p_result->'metrics') is distinct from 'object' then raise exception 'invalid_benchmark_metrics';end if;
  if exists(select 1 from jsonb_object_keys(p_result->'metrics') k where k not in ('cache','locator','crop','outcome','elapsed_ms')) or coalesce(p_result#>>'{metrics,cache}','') not in ('not_checked','hit','miss','unavailable','timeout','aborted','other') or coalesce(p_result#>>'{metrics,locator}','') not in ('not_checked','located','stored_region','aborted','unsupported_mime','invalid_jpeg','byte_limit','pixel_limit','exif_invalid','exif_rotation','region_response_invalid','region_role_unknown','region_role_invalid','region_box_shape','region_coordinate_invalid','region_geometry_invalid','region_bounds','timeout','invalid_json','request_failed','provider_http','other') or coalesce(p_result#>>'{metrics,crop}','') not in ('not_checked','used','aborted','unsupported_mime','invalid_jpeg','byte_limit','pixel_limit','exif_invalid','exif_rotation','region_missing_or_invalid','region_bounds','codec_import','codec_decode','codec_dimensions','crop_bounds','codec_encode','output_limit','other') or coalesce(p_result#>>'{metrics,outcome}','') not in ('exact','proof_mismatch','invalid_image','storage_unavailable','image_hash_mismatch','gemini_invalid_json','aborted','provider_http','failed') or jsonb_typeof(p_result#>'{metrics,elapsed_ms}') is distinct from 'number' or coalesce(p_result#>>'{metrics,elapsed_ms}','') !~ '^[0-9]{1,6}
 if not exists(select 1 from public.chat_bank_bill_receipts r join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null where r.id=p_id and r.status='received' and r.ledger_id is not null and md5(r.raw_read::text)=j.raw_hash and r.image_sha256=j.image_sha256) then target:='stale';end if;
 update v0_private.bill_account_crop_benchmark set state=target,result=case when target='stale' then null else p_result end,lease_id=null,lease_until=null,updated_at=now() where receipt_id=p_id;
 return target;
end $f$;
 then raise exception 'invalid_benchmark_metrics';end if;
  if (p_result#>>'{metrics,elapsed_ms}')::int>120000 or ((p_result#>>'{metrics,outcome}'='exact') is distinct from (p_state='verified')) then raise exception 'invalid_benchmark_metrics';end if;
 end if;
 target:=p_state;
 if not exists(select 1 from public.chat_bank_bill_receipts r join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null where r.id=p_id and r.status='received' and r.ledger_id is not null and md5(r.raw_read::text)=j.raw_hash and r.image_sha256=j.image_sha256) then target:='stale';end if;
 update v0_private.bill_account_crop_benchmark set state=target,result=case when target='stale' then null else p_result end,lease_id=null,lease_until=null,updated_at=now() where receipt_id=p_id;
 return target;
end $f$;
revoke all on function public.v0_bill_crop_benchmark_finish(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.v0_bill_crop_benchmark_finish(uuid,uuid,text,jsonb) to service_role;
commit;
