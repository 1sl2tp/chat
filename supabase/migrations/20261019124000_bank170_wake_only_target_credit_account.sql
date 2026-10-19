-- BANK-169: when Agribank app pushes late, wake bills using the ORIGINAL bank transfer timestamp.
-- Android posted_at / Supabase received_at remain audit metadata and are not pairing clocks.
begin;
create or replace function public.chat_bank_bill_wake_on_agribank_notification()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp'
as $fn$
declare
  v_asset uuid;
  v_dispatch_key text;
  v_transaction_at timestamptz;
begin
  if new.package_name<>'com.vnpay.Agribank3g'
    or new.status<>'credit_candidate' or new.amount_vnd is null
    or new.amount_vnd<=0 or new.is_own_transfer=true
    or new.bank_credit_account is distinct from '2901181999999'
  then return new; end if;
  v_transaction_at:=public.chat_agribank_transfer_at(new.body);
  if v_transaction_at is null or v_transaction_at>now()+interval '2 minutes'
  then return new; end if;
  select scan_key into v_dispatch_key from public.chat_customer_summary_runtime_config();
  if nullif(v_dispatch_key,'') is null then return new; end if;
  for v_asset in
    select r.media_asset_id from public.chat_bank_bill_receipts r
    where r.ledger_id is null and (
      r.status='queued'
      or (r.status='amount_read' and r.amount_vnd=new.amount_vnd
        and r.transfer_at_vn between
              (v_transaction_at at time zone 'Asia/Ho_Chi_Minh')-interval '5 minutes'
          and (v_transaction_at at time zone 'Asia/Ho_Chi_Minh')+interval '5 minutes')
    )
    order by case when r.status='amount_read' then 0 else 1 end,
       abs(extract(epoch from(r.sent_at-v_transaction_at))) asc
    limit 200
  loop
    perform net.http_post(
      url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-bank-bill-event',
      headers:=jsonb_build_object('content-type','application/json','x-internal-dispatch-key',v_dispatch_key),
      body:=jsonb_build_object('asset_id',v_asset::text),
      timeout_milliseconds:=35000
    );
  end loop;
  return new;
exception when others then
  raise warning 'bank169_wake_error: %',sqlerrm;
  return new;
end
$fn$;
commit;