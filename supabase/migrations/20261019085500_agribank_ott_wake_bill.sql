-- BANK-162: allow either legitimate SMS or Agribank Plus credit notification to wake AI.
begin;
CREATE OR REPLACE FUNCTION public.chat_bank_bill_queue_amount_image()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_sender uuid;
 v_sent timestamptz;
 v_dispatch_key text;
begin
 if new.kind <> 'image' or new.deleted_at is not null or new.message_id is null then return new; end if;
 select m.sender_account_id,m.created_at into v_sender,v_sent
 from public.v21_messages m join public.v21_accounts a on a.id=m.sender_account_id
 where m.id=new.message_id and m.deleted_at is null
  and m.sender_account_id=new.owner_account_id
  and a.role='user' and a.contact_group='customer'
  and a.deleted_at is null and a.locked_at is null;
 if v_sender is null then return new; end if;
 insert into public.chat_bank_bill_receipts(media_asset_id,message_id,customer_account_id,sent_at,status,reason)
 values(new.id,new.message_id,v_sender,v_sent,'queued','waiting_for_banking_sms')
 on conflict(media_asset_id) do nothing;

 -- No SMS => no Edge dispatch, no Storage image download, and no Gemini use.
 if not (exists(
   select 1 from public.taphoa_sms_inbox s
   where s.sender ~* '^(AGRIBANK|[A-Z]{2}-AGRIBANK)$'
     and s.body ~* '(^|[^[:alnum:]])TK[[:space:]:.]*[0-9*X]{5,22}'
     and s.body ~ '\+[[:space:]]*[0-9]'
     and s.received_at between v_sent - interval '24 hours' and v_sent + interval '10 minutes'
     and s.created_at >= now()-interval '48 hours'
   limit 1
 ) or exists(
   select 1 from public.taphoa_agribank_notifications n
   where n.status='credit_candidate'
     and n.amount_vnd>0
     and n.package_name='com.vnpay.Agribank3g'
     and n.posted_at between v_sent-interval '24 hours' and v_sent+interval '10 minutes'
     and n.created_at>=now()-interval '48 hours'
   limit 1
 )) then return new; end if;

 select scan_key into v_dispatch_key from public.chat_customer_summary_runtime_config();
 if nullif(v_dispatch_key,'') is not null then
   perform net.http_post(
     url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-bank-bill-event',
     headers:=jsonb_build_object('content-type','application/json','x-internal-dispatch-key',v_dispatch_key),
     body:=jsonb_build_object('asset_id',new.id::text),
     timeout_milliseconds:=35000
   );
 end if;
 return new;
exception when others then return new;
end
$function$

create or replace function public.chat_bank_bill_wake_on_agribank_notification()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare v_asset uuid; v_dispatch_key text;
begin
 if new.package_name<>'com.vnpay.Agribank3g' or new.status<>'credit_candidate'
   or new.amount_vnd is null or new.amount_vnd<=0
   or new.posted_at<now()-interval '24 hours' or new.posted_at>now()+interval '10 minutes'
 then return new; end if;
 select scan_key into v_dispatch_key from public.chat_customer_summary_runtime_config();
 if nullif(v_dispatch_key,'') is null then return new; end if;
 for v_asset in
   select media_asset_id from public.chat_bank_bill_receipts
   where status='queued'
     and sent_at between new.posted_at-interval '10 minutes' and new.posted_at+interval '24 hours'
     and created_at>=now()-interval '48 hours'
   order by sent_at desc limit 6
 loop
   perform net.http_post(
    url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-bank-bill-event',
    headers:=jsonb_build_object('content-type','application/json','x-internal-dispatch-key',v_dispatch_key),
    body:=jsonb_build_object('asset_id',v_asset::text),
    timeout_milliseconds:=35000
   );
 end loop;
 return new;
exception when others then return new;
end $fn$;
drop trigger if exists chat_bank_bill_wake_on_app_notification_trg on public.taphoa_agribank_notifications;
create trigger chat_bank_bill_wake_on_app_notification_trg
after insert on public.taphoa_agribank_notifications
for each row execute function public.chat_bank_bill_wake_on_agribank_notification();
commit;