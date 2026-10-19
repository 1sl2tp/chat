-- BANK-169: Classify customer bill images upon upload; no need for a banking push first.
-- A separate valid bank credit will later wake an OCR-read bill by BANK TRANSACTION time.
begin;
create or replace function public.chat_bank_bill_queue_amount_image()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp'
as $fn$
declare v_sender uuid;v_sent timestamptz;v_dispatch_key text;
begin
 if new.kind<>'image' or new.deleted_at is not null or new.message_id is null then return new; end if;
 select m.sender_account_id,m.created_at into v_sender,v_sent
 from public.v21_messages m join public.v21_accounts a on a.id=m.sender_account_id
 where m.id=new.message_id and m.deleted_at is null
   and m.sender_account_id=new.owner_account_id
   and a.role='user' and a.contact_group='customer'
   and a.deleted_at is null and a.locked_at is null;
 if v_sender is null then return new; end if;
 insert into public.chat_bank_bill_receipts(media_asset_id,message_id,customer_account_id,sent_at,status,reason)
 values(new.id,new.message_id,v_sender,v_sent,'queued','waiting_for_bank_transaction_match')
 on conflict(media_asset_id) do nothing;
 select scan_key into v_dispatch_key from public.chat_customer_summary_runtime_config();
 if nullif(v_dispatch_key,'') is not null then
   perform net.http_post(
     url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-bank-bill-event',
     headers:=jsonb_build_object('content-type','application/json','x-internal-dispatch-key',v_dispatch_key),
     body:=jsonb_build_object('asset_id',new.id::text),timeout_milliseconds:=35000
   );
 end if;
 return new;
exception when others then
 raise warning 'bank169_customer_image_dispatch_error: %',sqlerrm;
 return new;
end
$fn$;
commit;