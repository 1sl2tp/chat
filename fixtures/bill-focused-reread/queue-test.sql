\set ON_ERROR_STOP on
create role anon nologin;create role authenticated nologin;create role service_role nologin;
create table public.chat_bank_bill_receipts(id uuid primary key,media_asset_id uuid,message_id uuid,customer_account_id uuid,raw_read jsonb,image_sha256 text,status text,sent_at timestamptz,ledger_id bigint);
create table public.v21_media_assets(id uuid primary key,message_id uuid,owner_account_id uuid,deleted_at timestamptz,storage_key text,mime_type text);
\ir ../../supabase/functions/v21-bank-bill-event/deferred-reread-queue-candidate.sql
insert into public.v21_media_assets values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',null,'fixture.png','image/png');
insert into public.chat_bank_bill_receipts values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"transfer_success_visible":true,"account_digit_recheck_state":"timeout","small_text_recheck_state":"request_failed"}',repeat('a',64),'received',now(),123);
do $test$
declare j jsonb; k jsonb; before_row jsonb;
begin
 select to_jsonb(r) into before_row from public.chat_bank_bill_receipts r;
 if has_function_privilege('authenticated','public.v0_bill_focus_claim()','execute') or has_table_privilege('service_role','v0_private.bill_focused_reread','update') then raise exception 'unsafe_grant';end if;
 if public.v0_bill_focus_seed(20)<>2 or public.v0_bill_focus_seed(20)<>0 then raise exception 'seed_duplicate';end if;
 j:=public.v0_bill_focus_claim();
 if j->>'field'<>'account' or public.v0_bill_focus_claim() is not null then raise exception 'claim_priority_or_duplicate';end if;
 if public.v0_bill_focus_finish((j->>'id')::uuid,gen_random_uuid(),'retry',null)<>'stale' then raise exception 'lease_bypass';end if;
 if public.v0_bill_focus_finish((j->>'id')::uuid,(j->>'lease_id')::uuid,'retry',null)<>'retry' then raise exception 'retry';end if;
 k:=public.v0_bill_focus_claim();
 if k->>'field'<>'small_text' then raise exception 'backoff';end if;
 if public.v0_bill_focus_finish((k->>'id')::uuid,(k->>'lease_id')::uuid,'verified','{"memo":"fixture memo"}')<>'verified' then raise exception 'save';end if;
 update v0_private.bill_focused_reread set next_at=now()-interval '1 second' where id=(j->>'id')::uuid;
 j:=public.v0_bill_focus_claim();
 if public.v0_bill_focus_finish((j->>'id')::uuid,(j->>'lease_id')::uuid,'retry',null)<>'needs_review' then raise exception 'attempt_cap';end if;
 if public.v0_bill_focus_claim() is not null then raise exception 'third_attempt';end if;
 if before_row is distinct from (select to_jsonb(r) from public.chat_bank_bill_receipts r) then raise exception 'financial_row_changed';end if;
 raise notice 'Focused queue seed, lease, backoff, cap, display evidence and unchanged receipt passed';
end $test$;
