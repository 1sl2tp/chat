-- BANK-159: SMS-gated bank-image AI. Receipt evidence only; NO automatic collection.
-- Deploy the guarded bank-bill Edge function before this migration.
begin;
create or replace function public.chat_bank_bill_queue_amount_image()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp'
as $body$
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
 if not exists(
   select 1 from public.taphoa_sms_inbox s
   where s.sender ~* '^(AGRIBANK|[A-Z]{2}-AGRIBANK)$'
     and s.body ~* '(^|[^[:alnum:]])TK[[:space:]:.]*[0-9*X]{5,22}'
     and s.body ~ '\+[[:space:]]*[0-9]'
     and s.received_at between v_sent - interval '24 hours' and v_sent + interval '10 minutes'
     and s.created_at >= now()-interval '48 hours'
   limit 1
 ) then return new; end if;

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
$body$;

create or replace function public.chat_bank_bill_wake_on_new_sms()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp'
as $body$
declare
 v_dispatch_key text;
 v_asset uuid;
begin
 -- New unique, plausibly incoming, recent Agribank text only; never send on SMS UPDATE.
 if new.sender !~* '^(AGRIBANK|[A-Z]{2}-AGRIBANK)$'
    or new.body !~* '(^|[^[:alnum:]])TK[[:space:]:.]*[0-9*X]{5,22}'
    or new.body !~ '\+[[:space:]]*[0-9]'
    or new.received_at < now()-interval '24 hours'
    or new.received_at > now()+interval '10 minutes'
 then return new; end if;
 select scan_key into v_dispatch_key from public.chat_customer_summary_runtime_config();
 if nullif(v_dispatch_key,'') is null then return new; end if;
 -- Strict per-SMS fan-out cap; unmatched older images stay available for manual review.
 for v_asset in
   select r.media_asset_id
   from public.chat_bank_bill_receipts r
   where r.status='queued'
     and r.sent_at between new.received_at-interval '10 minutes'
                       and new.received_at+interval '24 hours'
     and r.created_at >= now()-interval '48 hours'
   order by r.sent_at desc, r.media_asset_id
   limit 6
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
end
$body$;
revoke all on function public.chat_bank_bill_wake_on_new_sms() from public,anon,authenticated;
drop trigger if exists chat_bank_bill_wake_on_sms_insert_trg on public.taphoa_sms_inbox;
create trigger chat_bank_bill_wake_on_sms_insert_trg
after insert on public.taphoa_sms_inbox
for each row execute function public.chat_bank_bill_wake_on_new_sms();
commit;