\set ON_ERROR_STOP on
\ir ../../supabase/functions/v21-bank-bill-event/account-region-cache-candidate.sql
do $test$
declare rid uuid; j jsonb; lease uuid; sha text; before_row jsonb; region jsonb:='{"role":"recipient_account","box":[400,150,500,850]}';
begin
 select id into strict rid from public.chat_bank_bill_receipts;
 select to_jsonb(r) into before_row from public.chat_bank_bill_receipts r where id=rid;
 if has_function_privilege('authenticated','public.v0_bill_account_region_cache_get(text,uuid,uuid,text,integer)','execute') or has_function_privilege('anon','public.v0_bill_account_region_cache_put(text,uuid,uuid,text,integer,jsonb)','execute') or has_table_privilege('service_role','v0_private.bill_account_region_cache','insert') then raise exception 'cache_unsafe_grants';end if;
 update v0_private.bill_focus_control set mode='pilot';
 update v0_private.bill_account_crop_benchmark set state='queued',result=null where receipt_id=rid;
 j:=public.v0_bill_crop_benchmark_claim(); lease:=(j->>'lease_id')::uuid;sha:=j->>'image_sha256';
 if j is null then raise exception 'cache_no_claim';end if;
 if public.v0_bill_account_region_cache_get('benchmark',rid,lease,sha,1) is not null then raise exception 'unexpected_cache';end if;
 if public.v0_bill_account_region_cache_put('benchmark',rid,gen_random_uuid(),sha,1,region) then raise exception 'wrong_lease';end if;
 if public.v0_bill_account_region_cache_put('benchmark',rid,lease,repeat('f',64),1,region) then raise exception 'wrong_hash';end if;
 if public.v0_bill_account_region_cache_put('benchmark',rid,lease,sha,1,'{"role":"recipient_account","box":[0,0,1000,1000]}') then raise exception 'invalid_box';end if;
 if not public.v0_bill_account_region_cache_put('benchmark',rid,lease,sha,1,region) then raise exception 'cache_put';end if;
 if public.v0_bill_account_region_cache_get('benchmark',rid,lease,sha,1) is distinct from region then raise exception 'cache_get';end if;
 if public.v0_bill_account_region_cache_get('benchmark',rid,lease,sha,2) is not null then raise exception 'cache_version';end if;
 if not public.v0_bill_account_region_cache_remove('benchmark',rid,lease,sha,1) then raise exception 'cache_remove';end if;
 if not public.v0_bill_account_region_cache_put('benchmark',rid,lease,sha,1,region) then raise exception 'cache_put_again';end if;
 update v0_private.bill_account_region_cache set updated_at=now()-interval '8 days' where receipt_id=rid;
 if public.v0_bill_account_region_cache_get('benchmark',rid,lease,sha,1) is not null then raise exception 'expired_cache';end if;
 if public.v0_bill_crop_benchmark_finish(rid,lease,'verified','{"crop_used":true,"exact":true,"requests":2}')<>'verified' then raise exception 'finish';end if;
 if public.v0_bill_account_region_cache_put('benchmark',rid,lease,sha,1,region) then raise exception 'expired_lease';end if;
 if before_row is distinct from (select to_jsonb(r) from public.chat_bank_bill_receipts r where id=rid) then raise exception 'receipt_mutated';end if;
 update v0_private.bill_focus_control set mode='off';
 raise notice 'Coordinate cache scope, hash, version, lease, expiry, grants and unchanged receipt passed';
end $test$;
