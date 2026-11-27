-- Source-only candidate; apply after benchmark and activation schema, only after review.
begin;
create function v0_private.bill_extra_ai_permit(p_kind text) returns boolean
language plpgsql set search_path='' as $permit$
begin
 if p_kind is null or p_kind not in ('focused','benchmark') then return false;end if;
 if not pg_try_advisory_xact_lock(75638129) then return false;end if;
 if (p_kind='benchmark' and public.v0_bill_focus_mode()<>'pilot') or (p_kind='focused' and public.v0_bill_focus_mode() not in ('pilot','auto')) then return false;end if;
 return not exists(select 1 from v0_private.bill_account_crop_benchmark where state='running' and lease_until>clock_timestamp())
 and not exists(select 1 from v0_private.bill_focused_reread where state='running' and lease_until>clock_timestamp());
end $permit$;
revoke all on function v0_private.bill_extra_ai_permit(text) from public,anon,authenticated,service_role;
create or replace function public.v0_bill_focus_claim() returns jsonb
language plpgsql security definer set search_path='' as $q$
declare j v0_private.bill_focused_reread; r public.chat_bank_bill_receipts; a public.v21_media_assets;
begin
 if not v0_private.bill_extra_ai_permit('focused') then return null;end if;
 update v0_private.bill_focused_reread set state='needs_review',lease_id=null,lease_until=null,updated_at=now() where state='running' and lease_until<=clock_timestamp() and attempts>=2;
 -- One outstanding AI job globally; serialize claim decisions even across workers.
 select * into j from v0_private.bill_focused_reread where v0_private.bill_focus_allowed(receipt_id) and attempts<2 and ((state in ('queued','retry') and next_at<=now()) or (state='running' and lease_until<=clock_timestamp())) order by case when field='account' then 0 else 1 end,next_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 select * into r from public.chat_bank_bill_receipts where id=j.receipt_id and md5(raw_read::text)=j.raw_hash and image_sha256=j.image_sha256 and status in ('received','amount_read','review','duplicate');
 if found then select * into a from public.v21_media_assets where id=r.media_asset_id and message_id=r.message_id and owner_account_id=r.customer_account_id and deleted_at is null;end if;
 if r.id is null or a.id is null then update v0_private.bill_focused_reread set state='stale',lease_id=null,lease_until=null,updated_at=now() where id=j.id;return null;end if;
 update v0_private.bill_focused_reread set state='running',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds',updated_at=now() where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'lease_id',j.lease_id,'field',j.field,'raw',r.raw_read,'image_sha256',j.image_sha256,'storage_key',a.storage_key,'mime_type',a.mime_type);
end $q$;
create or replace function public.v0_bill_crop_benchmark_claim() returns jsonb language plpgsql security definer set search_path='' as $f$
declare j v0_private.bill_account_crop_benchmark; r public.chat_bank_bill_receipts; a public.v21_media_assets;
begin
 if not v0_private.bill_extra_ai_permit('benchmark') then return null;end if;
 update v0_private.bill_account_crop_benchmark set state='failed',lease_id=null,lease_until=null,updated_at=now() where state='running' and lease_until<=clock_timestamp();
 select * into j from v0_private.bill_account_crop_benchmark where state='queued' order by receipt_id limit 1 for update skip locked;
 if not found then return null;end if;
 select * into r from public.chat_bank_bill_receipts where id=j.receipt_id and status='received' and ledger_id is not null and sent_at>='2026-11-27T00:00:00+07' and sent_at<'2026-11-28T00:00:00+07' and raw_read->>'transfer_success_visible'='true' and md5(raw_read::text)=j.raw_hash and image_sha256=j.image_sha256;
 if found then select * into a from public.v21_media_assets where id=r.media_asset_id and message_id=r.message_id and owner_account_id=r.customer_account_id and deleted_at is null;end if;
 if r.id is null or a.id is null then update v0_private.bill_account_crop_benchmark set state='stale',updated_at=now() where receipt_id=j.receipt_id;return null;end if;
 update v0_private.bill_account_crop_benchmark set state='running',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds',updated_at=now() where receipt_id=j.receipt_id returning * into j;
 return jsonb_build_object('id',j.receipt_id,'lease_id',j.lease_id,'region',r.raw_read->'recipient_account_region','image_sha256',r.image_sha256,'storage_key',a.storage_key,'mime_type',a.mime_type);
end $f$;
create or replace function v0_private.bill_focus_dispatch() returns bigint
language plpgsql security definer set search_path='' as $dispatch$
declare k text; req bigint;
begin
 if public.v0_bill_focus_mode() not in ('pilot','auto') then return null;end if;
 perform pg_advisory_xact_lock(75638130);
 -- Seed at most 20; no traffic when idle. Never touch the financial retry schedule.
 perform public.v0_bill_focus_seed(20);
 if not v0_private.bill_extra_ai_permit('focused') then return null;end if;
 if not exists(select 1 from v0_private.bill_focused_reread where v0_private.bill_focus_allowed(receipt_id) and attempts<2 and ((state in ('queued','retry') and next_at<=now()) or (state='running' and lease_until<=now()))) then return null;end if;
 select scan_key into k from public.chat_customer_summary_runtime_config();
 if k is null or length(k)<16 then return null;end if;
 select net.http_post(url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-bank-bill-event',
 headers:=jsonb_build_object('content-type','application/json','x-internal-dispatch-key',k),
 body:='{"action":"focused_reread"}'::jsonb,timeout_milliseconds:=45000) into req;
 return req;
end $dispatch$;

revoke all on function public.v0_bill_focus_claim(),public.v0_bill_crop_benchmark_claim() from public,anon,authenticated,service_role;
grant execute on function public.v0_bill_focus_claim(),public.v0_bill_crop_benchmark_claim() to service_role;
commit;
