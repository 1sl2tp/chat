-- Remove the abandoned automatic receipt/bill collection experiment.
-- Customer bill images remain normal Chat media. No image may write debt automatically.

begin;

drop trigger if exists v21_receipt_media_detect on public.v21_media_assets;

drop function if exists public.v21_receipt_media_trigger();
drop function if exists public.v21_receipt_scan_enqueue_http(uuid);
drop function if exists public.v21_receipt_finalize_kh(uuid,jsonb);
drop function if exists public.v21_receipt_finalize(uuid,jsonb);

drop table if exists public.v21_receipt_jobs cascade;

commit;
