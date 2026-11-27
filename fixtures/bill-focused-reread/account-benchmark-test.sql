\set ON_ERROR_STOP on
\ir ../../supabase/functions/v21-bank-bill-event/account-crop-benchmark-candidate.sql
do $test$
declare rid uuid; j jsonb; before_row jsonb;
begin
 select id into strict rid from public.chat_bank_bill_receipts;
 update public.chat_bank_bill_receipts set sent_at='2026-11-27T12:00:00+07',status='received' where id=rid;
 select to_jsonb(r) into before_row from public.chat_bank_bill_receipts r where id=rid;
 insert into v0_private.bill_account_crop_benchmark(receipt_id,raw_hash,image_sha256) select id,md5(raw_read::text),image_sha256 from public.chat_bank_bill_receipts where id=rid;
 if has_function_privilege('authenticated','public.v0_bill_crop_benchmark_claim()','execute') or has_table_privilege('service_role','v0_private.bill_account_crop_benchmark','insert') then raise exception 'unsafe_benchmark_grant';end if;
 if public.v0_bill_crop_benchmark_claim() is not null then raise exception 'off_benchmark';end if;
 update v0_private.bill_focus_control set mode='pilot';
 update v0_private.bill_focused_reread set state='needs_review',lease_id=null,lease_until=null where state='running';
 j:=public.v0_bill_crop_benchmark_claim();
 if j is null or public.v0_bill_crop_benchmark_claim() is not null then raise exception 'benchmark_lease';end if;
 if public.v0_bill_crop_benchmark_finish(rid,gen_random_uuid(),'verified','{"crop_used":true,"exact":true,"requests":2}')<>'stale' then raise exception 'benchmark_wrong_lease';end if;
 if public.v0_bill_crop_benchmark_finish(rid,(j->>'lease_id')::uuid,'verified','{"crop_used":true,"exact":true,"requests":2}')<>'verified' then raise exception 'benchmark_finish';end if;
 if public.v0_bill_crop_benchmark_claim() is not null then raise exception 'benchmark_replay';end if;
 if before_row is distinct from (select to_jsonb(r) from public.chat_bank_bill_receipts r where id=rid) then raise exception 'benchmark_finance_changed';end if;
 update v0_private.bill_focus_control set mode='off';
 raise notice 'Benchmark off gate, lease, grants, one-shot, unchanged receipt passed';
end $test$;
