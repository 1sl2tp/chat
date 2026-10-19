-- BANK-164: a new positive app event also wakes a previously AI-read matching bill without re-running AI.
begin;
CREATE OR REPLACE FUNCTION public.chat_bank_bill_wake_on_agribank_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   where (status='queued' or (status='amount_read' and amount_vnd=new.amount_vnd))
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
end $function$;
commit;