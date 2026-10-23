-- BANK-189: a wrong OCR YEAR is NOT a missing bill. Match only a uniquely
-- proven Agribank credit and customer image; preserve immutable AI originals.
-- Prior-day financial collections are NEVER auto-posted.
create table if not exists public.chat_bank_ocr_year_evidence (
 id uuid primary key default gen_random_uuid(),
 receipt_id uuid not null unique references public.chat_bank_bill_receipts(id),
 notification_id bigint not null unique references public.taphoa_agribank_notifications(id),
 customer_account_id uuid not null references public.v21_accounts(id),
 ocr_datetime timestamp not null,
 bank_datetime timestamp not null,
 original_read jsonb not null,
 notification_fingerprint text not null,
 outcome text not null check(outcome in ('prior_day_review','same_day_received')),
 ledger_id bigint,
 created_at timestamptz not null default now()
);
alter table public.chat_bank_ocr_year_evidence enable row level security;
revoke all on public.chat_bank_ocr_year_evidence from public,anon,authenticated;

create or replace function public.chat_bank_reconcile_ocr_year(
 p_asset_id uuid,p_notification_id bigint
) returns jsonb language plpgsql security definer
set search_path=public,v21_private,pg_temp
as $bank189$
declare
 r public.chat_bank_bill_receipts%rowtype;
 n public.taphoa_agribank_notifications%rowtype;
 bank_local timestamp;
 print_date text[];
 print_amount text[];
 memo text;
 bank_memo text;
 result jsonb;
 v_evidence_id uuid;
begin
 perform pg_advisory_xact_lock(17812026);
 select * into r from public.chat_bank_bill_receipts where media_asset_id=p_asset_id for update;
 select * into n from public.taphoa_agribank_notifications where id=p_notification_id for update;
 if r.id is null or n.id is null then
  return jsonb_build_object('ok',false,'status','evidence_missing');
 end if;
 if exists(select 1 from public.chat_bank_ocr_year_evidence e
    where e.receipt_id=r.id or e.notification_id=n.id)
 then return jsonb_build_object('ok',false,'status','already_recorded'); end if;
 if r.status<>'amount_read' or r.ledger_id is not null
    or r.amount_vnd is null or r.amount_vnd<>n.amount_vnd
    or r.amount_vnd<=0 or mod(r.amount_vnd,1000)<>0
    or r.image_sha256 is null or r.model_name is null or r.scanned_at is null
    or r.raw_read->>'read_mode'<>'amount_hash_only'
    or r.raw_read->>'rule_version'<>'bank_bill_amount_v4_20261018'
    or r.raw_read->>'image_type'<>'successful_transfer_receipt'
    or r.raw_read->>'transfer_success_visible'<>'true'
    or r.raw_read->>'amount_clear'<>'true'
    or r.raw_read->>'transaction_selection'<>'single_detail'
    or r.raw_read->>'transaction_nature'<>'transfer'
    or r.transfer_at_vn is null
    or n.status<>'credit_candidate'
    or n.package_name<>'com.vnpay.Agribank3g'
    or n.is_own_transfer is distinct from false
    or n.bank_credit_account<>'2901181999999'
    or n.transfer_at is null
    or exists(select 1 from public.chat_bank_app_collection_links x
       where x.receipt_id=r.id or x.notification_id=n.id)
 then return jsonb_build_object('ok',false,'status','ineligible_or_used'); end if;
 if not exists(select 1 from public.taphoa_sms_ingest_devices d
    where d.id=n.device_id and d.active=true)
 then return jsonb_build_object('ok',false,'status','device_not_verified'); end if;
 if not exists(select 1 from public.v21_media_assets a
    join public.v21_messages m on m.id=a.message_id
    join public.v21_accounts u on u.id=m.sender_account_id
    where a.id=r.media_asset_id and m.id=r.message_id
      and a.owner_account_id=r.customer_account_id
      and u.id=r.customer_account_id and u.role='user'
      and u.contact_group='customer' and u.deleted_at is null and u.locked_at is null
      and a.deleted_at is null and a.kind='image' and m.deleted_at is null)
 then return jsonb_build_object('ok',false,'status','invalid_original_customer_image'); end if;

 bank_local:=n.transfer_at at time zone 'Asia/Ho_Chi_Minh';
 -- Only YEAR differs: month, day, hour, minute must agree exactly.
 if to_char(r.transfer_at_vn,'MM-DD HH24:MI')<>
       to_char(bank_local,'MM-DD HH24:MI')
    or extract(year from r.transfer_at_vn)=extract(year from bank_local)
    or abs(extract(epoch from (n.transfer_at-r.sent_at)))>300
    or bank_local::date<>(r.sent_at at time zone 'Asia/Ho_Chi_Minh')::date
    or n.transfer_at>now()+interval '2 minutes'
 then return jsonb_build_object('ok',false,'status','not_unique_year_error'); end if;

 -- Verify what the real bank NOTIFICATION PRINTED, not Android arrival time.
 print_date:=regexp_match(n.body,
    '([0-2][0-9]):([0-5][0-9])[[:space:]]+([0-3][0-9])/([0-1][0-9])/([0-9]{4})');
 print_amount:=regexp_match(n.body,
    '([0-9]{9,20})[[:space:]]*:[[:space:]]*\\+[[:space:]]*([0-9][0-9.,]*)[[:space:]]*(VND|VNĐ|Đ)','i');
 if print_date is null or print_amount is null
    or print_amount[1]<>'2901181999999'
    or replace(replace(print_amount[2],'.',''),',','')<>n.amount_vnd::text
    or print_date[1]||':'||print_date[2]||' '||
       print_date[3]||'/'||print_date[4]||'/'||print_date[5]
       <>to_char(bank_local,'HH24:MI DD/MM/YYYY')
 then return jsonb_build_object('ok',false,'status','bank_printed_data_conflict'); end if;
 if upper(n.body) ~ '(OTP|SOFTOTP|MA XAC THUC|MAT KHAU|PASSWORD|MA PIN|TIEN LAI|TRA LAI|HOAN PHI)'
 then return jsonb_build_object('ok',false,'status','bank_message_rejected'); end if;

 -- Content and recipient MUST independently corroborate this specific bill.
 memo:=regexp_replace(lower(unaccent(btrim(coalesce(r.raw_read->>'transfer_content','')))),
   '[[:space:]]+',' ','g');
 bank_memo:=regexp_replace(lower(unaccent(coalesce(n.body,''))),
   '[[:space:]]+',' ','g');
 if length(memo)<16 or position(memo in bank_memo)=0
    or upper(btrim(coalesce(r.receiving_name,'')))<>'BUI XUAN TUNG'
    or upper(btrim(coalesce(r.receiving_bank,'')))<>'AGRIBANK'
    or r.raw_read->>'recipient_account_last5'<>'99999'
 then return jsonb_build_object('ok',false,'status','memo_or_recipient_conflict'); end if;

 -- Do not guess which transfer/bill it is when another eligible candidate
 -- exists. Image hash, amount, original transfer clock and send time matter.
 if exists(select 1 from public.taphoa_agribank_notifications x
     where x.id<>n.id and x.status='credit_candidate'
       and x.amount_vnd=n.amount_vnd
       and x.transfer_at between n.transfer_at-interval '5 minutes'
                            and n.transfer_at+interval '5 minutes')
    or exists(select 1 from public.chat_bank_bill_receipts x
     where x.id<>r.id and (
       (x.image_sha256 is not null and x.image_sha256=r.image_sha256)
       or (x.amount_vnd=r.amount_vnd
        and x.status in ('queued','scanning','amount_read','review','received','historical_reference')
        and x.sent_at between n.transfer_at-interval '5 minutes'
                         and n.transfer_at+interval '5 minutes')))
 then return jsonb_build_object('ok',false,'status','multiple_possible_matches'); end if;

 -- Current-day money may be posted ONLY by the unchanged BANK-174 guard.
 -- An earlier day's receipt is marked for Admin review, never auto-backfilled.
 if bank_local::date<>(now() at time zone 'Asia/Ho_Chi_Minh')::date then
   insert into public.chat_bank_ocr_year_evidence(
     receipt_id,notification_id,customer_account_id,ocr_datetime,bank_datetime,
     original_read,notification_fingerprint,outcome)
   values(r.id,n.id,r.customer_account_id,r.transfer_at_vn,bank_local,
     r.raw_read,n.fingerprint,'prior_day_review');
   update public.chat_bank_bill_receipts
   set status='review',reason='ai_year_error_bank_verified_prior_day_review',
       raw_read=jsonb_set(r.raw_read,'{bank_verified_year_candidate}',
         jsonb_build_object('notification_id',n.id,
          'verified_transaction_datetime_vn',to_char(bank_local,'YYYY-MM-DD HH24:MI'),
          'original_ocr_datetime_vn',r.raw_read->>'transaction_datetime_vn',
          'manual_collection_required',true),true)
   where id=r.id and status='amount_read' and ledger_id is null;
   return jsonb_build_object('ok',true,'status','prior_day_review',
     'ledger_written',false,'receipt_id',r.id,'notification_id',n.id);
 end if;

 insert into public.chat_bank_ocr_year_evidence(
   receipt_id,notification_id,customer_account_id,ocr_datetime,bank_datetime,
   original_read,notification_fingerprint,outcome)
 values(r.id,n.id,r.customer_account_id,r.transfer_at_vn,bank_local,
   r.raw_read,n.fingerprint,'same_day_received') returning id into v_evidence_id;
 update public.chat_bank_bill_receipts
 set transfer_at_vn=bank_local,
     raw_read=jsonb_set(
       jsonb_set(
         jsonb_set(r.raw_read,'{transfer_date_vn}',to_jsonb(to_char(bank_local,'YYYY-MM-DD')),true),
         '{transaction_datetime_vn}',to_jsonb(to_char(bank_local,'YYYY-MM-DD HH24:MI')),true),
       '{match_preview}',jsonb_build_object('status','candidate_unique',
         'source','agribank_plus_notification','notification_id',n.id,
         'matched_amount_vnd',n.amount_vnd,'match_level',3),true)
 where id=r.id and status='amount_read' and ledger_id is null;
 result:=public.chat_bank_app_collect(r.media_asset_id,n.id);
 if coalesce((result->>'ok')::boolean,false) is distinct from true
     or result->>'status'<>'received'
 then raise exception 'bank189_existing_collection_guard_rejected:%',
      coalesce(result->>'status','unknown'); end if;
 update public.chat_bank_ocr_year_evidence
 set ledger_id=(result->>'ledger_id')::bigint where id=v_evidence_id;
 return result||jsonb_build_object('ocr_year_corrected',true);
end
$bank189$;
revoke all on function public.chat_bank_reconcile_ocr_year(uuid,bigint)
 from public,anon,authenticated;
grant execute on function public.chat_bank_reconcile_ocr_year(uuid,bigint)
 to service_role;
