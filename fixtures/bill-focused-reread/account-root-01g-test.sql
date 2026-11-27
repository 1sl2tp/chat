\set ON_ERROR_STOP on
\ir ../../supabase/functions/v21-bank-bill-event/account-benchmark-metrics-candidate.sql
do $test$
declare rid uuid; j jsonb; lease uuid; sha text; old_receipt jsonb; region jsonb:='{"role":"recipient_account","box":[400,150,500,850]}'; metrics jsonb:='{"cache":"hit","locator":"stored_region","crop":"used","outcome":"exact","elapsed_ms":25}'; payload jsonb;
begin
 select id into strict rid from public.chat_bank_bill_receipts;
 select to_jsonb(r) into old_receipt from public.chat_bank_bill_receipts r where id=rid;
 update v0_private.bill_focus_control set mode='pilot';
 update v0_private.bill_account_crop_benchmark set state='queued',result=null where receipt_id=rid;
 j:=public.v0_bill_crop_benchmark_claim();lease:=(j->>'lease_id')::uuid;sha:=j->>'image_sha256';
 if j is null then raise exception 'claim';end if;
 update v0_private.bill_account_crop_benchmark set lease_until=clock_timestamp()-interval '1 second' where receipt_id=rid;
 if public.v0_bill_account_region_cache_put('benchmark',rid,lease,sha,1,region) then raise exception 'late cache write';end if;
 update v0_private.bill_account_crop_benchmark set lease_until=clock_timestamp()+interval '60 seconds' where receipt_id=rid;
 payload:=jsonb_build_object('crop_used',true,'exact',true,'requests',1,'metrics',metrics);
 begin
  perform public.v0_bill_crop_benchmark_finish(rid,lease,'verified',jsonb_set(payload,'{metrics,cache}','"raw private text"'));
  raise exception 'unsafe metric accepted';
 exception when others then
  if sqlerrm<>'invalid_benchmark_metrics' then raise;end if;
 end;
 if public.v0_bill_crop_benchmark_finish(rid,lease,'verified',payload)<>'verified' then raise exception 'metrics finish';end if;
 if (select result from v0_private.bill_account_crop_benchmark where receipt_id=rid) is distinct from payload then raise exception 'metrics save';end if;
 if old_receipt is distinct from (select to_jsonb(r) from public.chat_bank_bill_receipts r where id=rid) then raise exception 'receipt changed';end if;
 update v0_private.bill_focus_control set mode='off';
 raise notice 'BANK-01g: expired lease rejects cache writes, safe metric validation and immutable receipt passed';
end $test$;
