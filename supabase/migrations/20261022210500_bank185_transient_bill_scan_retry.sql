-- BANK-185: Only retry temporary OCR failures, never infer a collection from amount alone.
-- Idempotent pg_cron wake; the Edge Function owns image validation, deduplication,
-- and all bank matching decisions. Cron cannot post debt or ledger transactions.
create or replace function v21_private.chat_bank_retry_transient_scan_failures()
returns integer
language plpgsql security definer
set search_path to pg_catalog, public, v21_private, pg_temp
as $function$
declare
  v_key text;
  v_asset uuid;
  v_count integer:=0;
  v_day date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select c.scan_key into v_key from public.chat_customer_summary_runtime_config() c;
  if nullif(v_key,'') is null then return 0; end if;
  for v_asset in
    select r.media_asset_id
    from public.chat_bank_bill_receipts r
    join public.v21_media_assets m on m.id=r.media_asset_id
      and m.deleted_at is null and m.kind='image'
      and m.owner_account_id=r.customer_account_id
    join public.v21_messages msg on msg.id=m.message_id
      and msg.deleted_at is null and msg.sender_account_id=r.customer_account_id
    join public.v21_accounts a on a.id=r.customer_account_id
      and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
    where r.status='failed' and r.ledger_id is null
      and r.attempt_count between 1 and 2
      and r.reason ~* '^amount_scan_(gemini_http_(429|5[0-9][0-9])|the signal has been aborted|aborterror|failed to fetch|load failed)$'
      and r.scanned_at <= now()-interval '2 minutes'
      and (r.sent_at at time zone 'Asia/Ho_Chi_Minh')::date=v_day
      and exists (
        select 1 from public.taphoa_agribank_notifications n
        where n.status='credit_candidate' and n.amount_vnd>0
          and n.package_name='com.vnpay.Agribank3g'
          and n.is_own_transfer=false
          and n.bank_credit_account='2901181999999'
          and (n.transfer_at at time zone 'Asia/Ho_Chi_Minh')::date=v_day
          and n.transfer_at between r.sent_at-interval '3 hours'
            and r.sent_at+interval '3 hours'
      )
    order by r.scanned_at, r.sent_at
    limit 10
  loop
    perform net.http_post(
      url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-bank-bill-event',
      headers:=jsonb_build_object('content-type','application/json','x-internal-dispatch-key',v_key),
      body:=jsonb_build_object('asset_id',v_asset::text),
      timeout_milliseconds:=35000
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
exception when others then
  raise warning 'bank185_transient_scan_retry_error: %',sqlerrm;
  return v_count;
end
$function$;

revoke all on function v21_private.chat_bank_retry_transient_scan_failures() from PUBLIC, anon, authenticated;
select cron.schedule('chat-bank-transient-bill-retry-5m','*/5 * * * *',
  'select v21_private.chat_bank_retry_transient_scan_failures();');
