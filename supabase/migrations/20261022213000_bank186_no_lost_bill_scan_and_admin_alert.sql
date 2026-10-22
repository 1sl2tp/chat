-- BANK-186: keep every customer image accounted for, including AI outages.
-- Image classification and bank matching are separate; this dispatch ONLY
-- queues the existing locked-down OCR function and never writes a collection.
alter table public.chat_bank_bill_receipts
 add column if not exists scan_started_at timestamptz;

create or replace function v21_private.chat_bank_retry_transient_scan_failures()
returns integer
language plpgsql security definer
set search_path=pg_catalog,public,v21_private,pg_temp
as $function$
declare
  v_key text;
  v_asset uuid;
  v_count integer:=0;
  v_cutoff timestamptz:=now()-interval '7 days';
begin
  -- Recover a worker that crashed after claiming an image. Four minutes
  -- exceeds the AI timeout, HTTP dispatch timeout, and usual edge latency.
  update public.chat_bank_bill_receipts r
    set status='failed',reason='amount_scan_worker_interrupted',
        scanned_at=now(),scan_started_at=null
  where r.status='scanning' and r.ledger_id is null
    and coalesce(r.scan_started_at,r.created_at)<=now()-interval '4 minutes';

  -- Retry budget exhausted / stale images never disappear: require human
  -- verification and preserve the original image, sent time and scan count.
  update public.chat_bank_bill_receipts r
    set status='review',
        reason=case when r.attempt_count>=6 then 'ai_scan_retry_exhausted'
                    else 'ai_scan_old_unresolved' end,
        scanned_at=now(),scan_started_at=null
  where r.status='failed' and r.ledger_id is null
    and (r.attempt_count>=6 or r.sent_at<v_cutoff);

  update public.chat_bank_bill_receipts r
    set status='review',reason='ai_scan_queue_expired_no_result',
        scanned_at=now(),scan_started_at=null
  where r.status='queued' and r.sent_at<v_cutoff;

  select scan_key into v_key from public.chat_customer_summary_runtime_config();
  if nullif(v_key,'') is null then
    raise warning 'bank186_scan_dispatch_key_unavailable';
    return 0;
  end if;

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
    where r.ledger_id is null and r.sent_at between v_cutoff and now()+interval '2 minutes'
      and (
        (r.status='queued' and r.created_at<=now()-interval '3 minutes')
        or (
          r.status='failed' and r.attempt_count between 1 and 5
          and r.reason ~* '^amount_scan_(gemini_http_(408|429|5[0-9][0-9])|the signal has been aborted|aborterror|failed to fetch|load failed|gemini_invalid_json|storage_download_failed|hash_registry_unavailable|worker_interrupted)$'
          and r.scanned_at<=now()-make_interval(mins:=case
            when r.attempt_count=1 then 3
            when r.attempt_count=2 then 10
            when r.attempt_count=3 then 30
            when r.attempt_count=4 then 60
            else 120 end)
        )
      )
    order by case when r.status='queued' then 0 else 1 end,
      r.scanned_at nulls first,r.sent_at
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
  raise warning 'bank186_scan_retry_error: %',sqlerrm;
  return v_count;
end
$function$;
revoke all on function v21_private.chat_bank_retry_transient_scan_failures() from public,anon,authenticated;

-- Keep the existing Admin push format. A failed OCR receipt is a REVIEW
-- alert, never a non-bill or a customer-facing paid confirmation.
create or replace function v21_private.chat_bank_admin_push_on_receipt()
returns trigger language plpgsql security definer
set search_path=public,v21_private,pg_temp as $function$
declare v_kind text;v_day date;v_username text;
begin
 if TG_OP='UPDATE' and old.status is not distinct from new.status then return new; end if;
 if new.status not in ('amount_read','review','duplicate','failed') then return new; end if;
 select username into v_username from public.v21_accounts where id=new.customer_account_id;
 if lower(coalesce(v_username,''))='test' then return new; end if;
 if exists(select 1 from public.chat_bank_app_collection_links l where l.receipt_id=new.id)
 then return new; end if;
 v_day:=(new.sent_at at time zone 'Asia/Ho_Chi_Minh')::date;
 v_kind:=case
   when new.status='amount_read' and new.amount_vnd>0
        and new.transfer_at_vn is not null and new.transfer_at_vn::date=v_day
   then 'bill_waiting'
   else 'review' end;
 perform v21_private.chat_bank_admin_push_enqueue(
   v_kind,v_kind||':'||new.id::text,null,new.id,v_day);
 return new;
end
$function$;
revoke all on function v21_private.chat_bank_admin_push_on_receipt() from public,anon,authenticated;

-- Prior-day failures should still alert Admin (within 7 days); never relax
-- normal bank-match notifications or resend historical financial alerts.
create or replace function v21_private.chat_bank_admin_push_enqueue(
  p_kind text,p_key text,p_notification_id bigint,p_receipt_id uuid,p_day date
) returns void language plpgsql security definer
set search_path=public,v21_private,pg_temp as $function$
declare v_today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 if p_kind not in ('bank_only','bill_waiting','matched','review')
    or p_day is null or p_day>v_today or p_day<date '2026-10-20'
    or (p_kind<>'review' and p_day<>v_today)
    or (p_kind='review' and p_day<v_today-7)
    or p_key is null or length(p_key)>128
 then return; end if;
 insert into public.chat_bank_admin_push_outbox(
   event_key,recipient_account_id,kind,notification_id,receipt_id,business_date)
 select p_key,a.id,p_kind,p_notification_id,p_receipt_id,p_day
 from public.v21_accounts a
 where a.role='admin' and a.auth_user_id is not null
   and a.deleted_at is null and a.locked_at is null
 on conflict(event_key,recipient_account_id) do nothing;
exception when others then
 raise warning 'bank186_push_enqueue_skipped: %',sqlstate;
end
$function$;
revoke all on function v21_private.chat_bank_admin_push_enqueue(text,text,bigint,uuid,date) from public,anon,authenticated;
