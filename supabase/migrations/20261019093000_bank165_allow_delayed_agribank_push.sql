-- BANK-165: notification delivery can lag the bank's own transfer time on locked Android.
-- Compare bill to timestamp printed by Agribank; allow up to 15m for OTT delivery lag.
-- Keep positive amount, recipient, transaction-time, bill identity and uniqueness guards.
begin;
CREATE OR REPLACE FUNCTION public.chat_bank_app_collect(p_asset_id uuid, p_notification_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
declare
  r public.chat_bank_bill_receipts%rowtype;
  n public.taphoa_agribank_notifications%rowtype;
  config public.chat_auto_collect_settings%rowtype;
  match_amount text[];
  match_date text[];
  account_number text;
  transfer_amount bigint;
  transaction_at timestamptz;
  image_at timestamptz;
  customer uuid;
  admin uuid;
  ledger bigint;
  before_balance numeric;
  after_balance numeric;
  thousands numeric;
  notice text;
  link text;
  message_id uuid;
  result jsonb;
  prior jsonb;
begin
  if p_asset_id is null or p_notification_id is null then
    return jsonb_build_object('ok',false,'status','missing_evidence');
  end if;
  -- Serializes all auto-captures against themselves and test pilot.
  perform pg_advisory_xact_lock(17812026);
  select * into config from public.chat_auto_collect_settings where singleton=true for update;
  if not found or not(config.enabled and config.ready) then
    return jsonb_build_object('ok',false,'status','disabled_or_not_ready');
  end if;

  select * into r from public.chat_bank_bill_receipts
  where media_asset_id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'status','bill_not_found'); end if;
  if r.status='received' and r.ledger_id is not null then
    select c.result into prior
      from public.chat_bank_app_collection_links l
      join public.taphoa_command_log c on c.command_id=l.receipt_id
      where l.receipt_id=r.id and l.notification_id=p_notification_id;
    if prior is not null then
      return jsonb_build_object('ok',true,'status','received','replayed',true,'ledger_id',r.ledger_id);
    end if;
    return jsonb_build_object('ok',false,'status','bill_already_used');
  end if;

  if r.status <> 'amount_read' or r.ledger_id is not null
     or r.amount_vnd is null or r.amount_vnd<=0 or r.amount_vnd>=1000000000000
     or mod(r.amount_vnd,1000)<>0
     or r.image_sha256 is null or r.model_name is null or r.scanned_at is null
     or r.raw_read->>'rule_version'<>'bank_bill_amount_v4_20261018'
     or r.raw_read->>'transfer_success_visible'<>'true'
     or r.raw_read->>'amount_clear'<>'true'
     or r.raw_read->>'transaction_selection' not in ('single_detail','latest_top_row')
     or r.raw_read->>'transaction_nature' not in ('transfer','incoming_transfer')
     or r.raw_read#>>'{match_preview,status}'<>'candidate_unique'
     or r.raw_read#>>'{match_preview,source}'<>'agribank_plus_notification'
     or r.raw_read#>>'{match_preview,notification_id}' is distinct from p_notification_id::text
     or r.sent_at<now()-interval '36 hours' or r.scanned_at<now()-interval '36 hours'
     or r.transfer_at_vn is null
  then return jsonb_build_object('ok',false,'status','bill_not_verified'); end if;
  select * into n from public.taphoa_agribank_notifications where id=p_notification_id for update;
  if not found or n.status<>'credit_candidate' or n.package_name<>'com.vnpay.Agribank3g'
    or n.amount_vnd is null or n.amount_vnd<=0 or n.created_at<now()-interval '36 hours'
    or not exists(select 1 from public.taphoa_sms_ingest_devices d
        where d.id=n.device_id and d.active=true)
  then return jsonb_build_object('ok',false,'status','notification_not_verified'); end if;
  if upper(n.body) ~ '(OTP|SOFTOTP|MA XAC THUC|MAT KHAU|PASSWORD|MA PIN|TIEN LAI|TRA LAI|HOAN PHI)'
  then return jsonb_build_object('ok',false,'status','notification_rejected'); end if;

  -- Parse one explicitly POSITIVE account credit; never parse account balance.
  match_amount:=regexp_match(n.body,
    '([0-9]{9,20})[[:space:]]*:[[:space:]]*\+[[:space:]]*([0-9][0-9.,]*)[[:space:]]*(VND|VNĐ|Đ)','i');
  if match_amount is null or match_amount[2] !~ '(^[0-9]{1,12}$|^[0-9]{1,3}([.,][0-9]{3})+$)' then
    return jsonb_build_object('ok',false,'status','unreadable_credit');
  end if;
  account_number:=match_amount[1];
  transfer_amount:=replace(replace(match_amount[2],'.',''),',','')::bigint;
  if account_number<>'2901181999999' or transfer_amount<>r.amount_vnd
    or transfer_amount<>n.amount_vnd or mod(transfer_amount,1000)<>0
  then return jsonb_build_object('ok',false,'status','credit_mismatch'); end if;
  -- Validate actual bank timestamp printed inside the Agribank notification.
  match_date:=regexp_match(n.body,
    '([0-2][0-9]):([0-5][0-9])[[:space:]]+([0-3][0-9])/([0-1][0-9])/([0-9]{4})');
  if match_date is null then return jsonb_build_object('ok',false,'status','bank_time_unreadable'); end if;
  begin
    transaction_at:=make_timestamp(match_date[5]::int,match_date[4]::int,
      match_date[3]::int,match_date[1]::int,match_date[2]::int,0) at time zone 'Asia/Ho_Chi_Minh';
  exception when datetime_field_overflow then
    return jsonb_build_object('ok',false,'status','bank_time_invalid');
  end;
  image_at:=r.transfer_at_vn at time zone 'Asia/Ho_Chi_Minh';
  if abs(extract(epoch from(n.posted_at-transaction_at)))>900
     or abs(extract(epoch from(image_at-transaction_at)))>300
     or r.sent_at<image_at-interval '2 minutes'
     or r.sent_at>image_at+interval '20 minutes'
     or n.posted_at>r.sent_at+interval '10 minutes'
     or r.sent_at<n.posted_at-interval '15 minutes'
  then return jsonb_build_object('ok',false,'status','time_mismatch'); end if;

  if upper(regexp_replace(btrim(coalesce(r.receiving_name,'')),'[[:space:]]+',' ','g'))<>'BUI XUAN TUNG'
     or upper(btrim(coalesce(r.receiving_bank,'')))<>'AGRIBANK'
     or coalesce(r.raw_read->>'recipient_account_last5','')<>'99999'
     or (r.receiving_account is not null and r.receiving_account<>'2901181999999')
  then return jsonb_build_object('ok',false,'status','recipient_not_verified'); end if;

  if exists(select 1 from public.chat_bank_app_collection_links l
       where l.notification_id=n.id or l.receipt_id=r.id)
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and (
         (o.image_sha256 is not null and o.image_sha256=r.image_sha256)
         or (o.amount_vnd=r.amount_vnd and o.status in ('amount_read','review','received','historical_reference')
              and o.transfer_at_vn between r.transfer_at_vn-interval '5 minutes' and r.transfer_at_vn+interval '5 minutes')
       ))
    or exists(select 1 from public.taphoa_agribank_notifications o
       where o.id<>n.id and o.status='credit_candidate' and o.amount_vnd=n.amount_vnd
         and o.posted_at between n.posted_at-interval '5 minutes' and n.posted_at+interval '5 minutes')
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and o.status in ('queued','scanning')
         and o.sent_at between r.sent_at-interval '3 minutes' and r.sent_at+interval '3 minutes')
  then return jsonb_build_object('ok',false,'status','duplicate_or_ambiguous'); end if;

  select m.sender_account_id into customer
  from public.v21_messages m
  join public.v21_media_assets a on a.message_id=m.id
  join public.v21_accounts c on c.id=m.sender_account_id
  where m.id=r.message_id and m.deleted_at is null
    and a.id=r.media_asset_id and a.deleted_at is null and a.kind='image'
    and a.owner_account_id=r.customer_account_id
    and c.id=r.customer_account_id and c.role='user' and c.contact_group='customer'
    and c.deleted_at is null and c.locked_at is null;
  if customer is null then return jsonb_build_object('ok',false,'status','customer_invalid'); end if;

  select a.id into admin from public.v21_messages m
  join public.v21_conversations conv on conv.id=m.conversation_id
  join public.v21_accounts a on a.id=case
    when conv.member_a=customer then conv.member_b else conv.member_a end
  where m.id=r.message_id and a.role='admin' and a.deleted_at is null and a.locked_at is null
  limit 1;
  if admin is null then return jsonb_build_object('ok',false,'status','admin_missing'); end if;
  -- Do not silently mutate a customer's balance if a matching collection
  -- notice is disallowed by the existing TAPHOA outbound settings.
  if not v21_private.chat_outbound_allowed(customer,'taphoa:'||r.id::text||':collection') then
    return jsonb_build_object('ok',false,'status','collection_notification_disabled');
  end if;
  thousands:=transfer_amount/1000;
  -- Hold when operator may have manually collected the same transfer.
  if exists(select 1 from public.taphoa_debt_ledger l
      where l.customer_account_id=customer and l.entry_type='collection'
        and l.amount_vnd=-thousands
        and l.created_at between transaction_at-interval '30 minutes' and now())
  then return jsonb_build_object('ok',false,'status','possible_manual_collection'); end if;
  if exists(select 1 from public.taphoa_command_log where command_id=r.id)
  then return jsonb_build_object('ok',false,'status','command_conflict'); end if;

  before_balance:=public.taphoa_chat_customer_balance_value(customer);
  insert into public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
    values(customer,'collection',-thousands,'Chuyển khoản tự động',admin)
    returning id into ledger;
  perform public.taphoa_bump_revision('debt');
  after_balance:=public.taphoa_chat_customer_balance_value(customer);
  notice:='✅ Đã thu · '||public.taphoa_chat_money(thousands)
    || E'\n'||public.taphoa_chat_balance_label(before_balance,true)
    || E'\n'||public.taphoa_chat_balance_label(after_balance,false)
    || E'\nGhi chú: Chuyển khoản tự động';
  link:=public.taphoa_customer_mini_link(customer,'no',null,null,null);
  if coalesce(link,'')<>'' then notice:=notice||E'\nXem công nợ: '||link; end if;
  message_id:=public.taphoa_chat_notify_customer(customer,admin,'taphoa:'||r.id::text||':collection',notice);

  result:=jsonb_build_object('ok',true,'customer_id',customer::text,
    'receipt_kind','collection','movement',-thousands,'amount_vnd',thousands,
    'balance_before_vnd',before_balance,'balance_after_vnd',after_balance,
    'receipt_note','Chuyển khoản tự động','receipt_at',now(),
    'notice_sent',message_id is not null);
  insert into public.taphoa_command_log(command_id,operation,result)
    values(r.id,'debt_transaction',result);
  insert into public.chat_bank_app_collection_links(receipt_id,notification_id,ledger_id)
    values(r.id,n.id,ledger);
  update public.chat_bank_bill_receipts
    set status='received',reason='agribank_plus_credit_and_bill_matched',
      ledger_id=ledger,balance_before_thousands=before_balance,
      balance_after_thousands=after_balance
    where id=r.id;
  return jsonb_build_object('ok',true,'status','received','ledger_id',ledger,
    'receipt_id',r.id,'notification_id',n.id,'replayed',false,
    'notice_sent',message_id is not null,'amount_thousands',thousands);
end;
$function$;
commit;