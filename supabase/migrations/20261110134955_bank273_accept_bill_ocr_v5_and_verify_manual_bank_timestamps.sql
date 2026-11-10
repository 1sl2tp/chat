-- BANK-273 (applied in production 2026-11-10, migration 20261110134955).
-- Preserve the existing idempotent financial RPC and its security-definer
-- privileges. Accept either versioned OCR reader v4 or v5. For historical
-- receipts with a manually reconstructed clock sourced from the official
-- Agribank credit, require an independently matching distinctive transfer
-- memo before any existing bank/customer/duplicate/current-day ledger guards.
-- No cron, backfill, policy change, or direct INSERT into the debt ledger.
-- The function below is the exact active production definition after apply_migration.
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
  verified_bill_memo text;
  verified_bank_memo text;
  raw_bank_memo text;
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
     or r.raw_read->>'rule_version' not in ('bank_bill_amount_v4_20261018','bank_bill_amount_v5_20261110')
     or r.raw_read->>'transfer_success_visible'<>'true'
     or r.raw_read->>'amount_clear'<>'true'
     or r.raw_read->>'transaction_selection' not in ('single_detail','latest_top_row')
     or r.raw_read->>'transaction_nature' not in ('transfer','incoming_transfer')
     or r.raw_read#>>'{match_preview,status}'<>'candidate_unique'
     or r.raw_read#>>'{match_preview,source}'<>'agribank_plus_notification'
     or r.raw_read#>>'{match_preview,notification_id}' is distinct from p_notification_id::text
     
     or r.transfer_at_vn is null
  then return jsonb_build_object('ok',false,'status','bill_not_verified'); end if;
  select * into n from public.taphoa_agribank_notifications where id=p_notification_id for update;
  if not found or n.status<>'credit_candidate' or n.package_name<>'com.vnpay.Agribank3g'
    or n.amount_vnd is null or n.amount_vnd<=0 or n.is_own_transfer=true or n.transfer_at is null
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
  -- BANK-212: one-minute transaction time tolerance.
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
   -- BANK-174: only current Vietnam business day may be auto-collected.
   -- Late push or yesterday's bill stays in review, never backfills a closed day.
   if r.transfer_at_vn::date <> (r.sent_at at time zone 'Asia/Ho_Chi_Minh')::date
      or r.transfer_at_vn::date <> (now() at time zone 'Asia/Ho_Chi_Minh')::date
      or (n.transfer_at at time zone 'Asia/Ho_Chi_Minh')::date <> r.transfer_at_vn::date
   then return jsonb_build_object('ok',false,'status','bill_outside_current_business_day'); end if;
  if abs(extract(epoch from(image_at-transaction_at)))>60
     or transaction_at>now()+interval '2 minutes'
  then return jsonb_build_object('ok',false,'status','time_mismatch'); end if;

  -- Tier 1: bank credit amount + printed transaction time + one unique valid bill.
  -- Tier 2: recipient name if readable; Tier 3: destination account and bank if readable.
  -- Missing optional text is NOT a blocker; clearly conflicting text remains review-only.
  if nullif(btrim(coalesce(r.receiving_name,'')),'') is not null
      and upper(regexp_replace(btrim(r.receiving_name),'[[:space:]]+',' ','g'))<>'BUI XUAN TUNG'
  then return jsonb_build_object('ok',false,'status','recipient_name_conflict'); end if;
  if nullif(btrim(coalesce(r.receiving_bank,'')),'') is not null
      and upper(btrim(r.receiving_bank))<>'AGRIBANK'
  then return jsonb_build_object('ok',false,'status','recipient_bank_conflict'); end if;
  if nullif(btrim(coalesce(r.raw_read->>'recipient_account_last5','')),'') is not null
      and r.raw_read->>'recipient_account_last5'<>right(account_number,5)
  then return jsonb_build_object('ok',false,'status','recipient_account_conflict'); end if;
  -- A customer receipt may show only *****99999 or a partly misread full account.
  -- Last five digits are optional supporting evidence; full account comes from Agribank.
  if nullif(btrim(coalesce(r.receiving_account,'')),'') is not null
    and length(regexp_replace(r.receiving_account,'[^0-9]','','g'))>=5
    and right(regexp_replace(r.receiving_account,'[^0-9]','','g'),5)<>right(account_number,5)
  then return jsonb_build_object('ok',false,'status','recipient_account_conflict'); end if;

  -- BANK-273: Timestamp repairs refer to a bank-notice clock, not directly
  -- read bill text. Require independent, uniquely identifying bank memo
  -- evidence BEFORE any financial collection on these historic repairs.
  if r.raw_read ? 'manual_datetime_correction' then
    if r.raw_read#>>'{manual_datetime_correction,source}' <> 'independent_agribank_credit_notification'
       or r.raw_read#>>'{manual_datetime_correction,bank_notice_id}' is distinct from n.id::text
       or r.raw_read#>>'{manual_datetime_correction,customer_ledger_untouched}' <> 'true'
       or r.raw_read#>>'{manual_datetime_correction,bank_time_precision}' <> 'minute'
    then return jsonb_build_object('ok',false,'status','manual_bank_time_not_verified'); end if;
    raw_bank_memo:=btrim(split_part(split_part(n.body,'Nội dung giao dịch:',2),'Số dư cuối:',1));
    verified_bill_memo:=upper(regexp_replace(extensions.unaccent(coalesce(r.raw_read->>'transfer_content','')),'[^A-Za-z0-9]','','g'));
    verified_bank_memo:=upper(regexp_replace(extensions.unaccent(raw_bank_memo),'[^A-Za-z0-9]','','g'));
    if length(verified_bill_memo)<12 or
      not (
        verified_bill_memo=verified_bank_memo
        or (length(verified_bill_memo)>=90
            and abs(length(verified_bill_memo)-length(verified_bank_memo))<=1
            and left(verified_bill_memo,90)=left(verified_bank_memo,90)
            and right(verified_bill_memo,15)=right(verified_bank_memo,15))
        or (length(verified_bill_memo)>=20
            and length(verified_bank_memo)-length(verified_bill_memo) between 0 and 2
            and right(verified_bank_memo,length(verified_bill_memo))=verified_bill_memo)
      )
    then return jsonb_build_object('ok',false,'status','manual_bank_time_memo_unverified'); end if;
  end if;

  if exists(select 1 from public.chat_bank_manual_collections m where m.notification_id=n.id)
    then return jsonb_build_object('ok',false,'status','already_manual_collected'); end if;

    if exists(select 1 from public.chat_bank_app_collection_links l
       where l.notification_id=n.id or l.receipt_id=r.id)
    -- BANK-214: same-amount transactions are not automatically duplicates.
    -- Require the same strong bank reference/date/origin, an identical image,
    -- or a competing claim on the SAME one-minute bank proof.
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and (
         (o.image_sha256 is not null and o.image_sha256=r.image_sha256)
         or (o.amount_vnd=r.amount_vnd and o.status in ('amount_read','review','received','historical_reference')
           and (
             o.transfer_at_vn between r.transfer_at_vn-interval '60 seconds'
               and r.transfer_at_vn+interval '60 seconds'
             or (
               nullif(btrim(o.transfer_reference),'') is not null
               and nullif(btrim(r.transfer_reference),'') is not null
               and upper(btrim(o.transfer_reference))=upper(btrim(r.transfer_reference))
               and o.transfer_at_vn::date=r.transfer_at_vn::date
               and (
                 nullif(btrim(o.sending_bank),'') is null
                 or nullif(btrim(r.sending_bank),'') is null
                 or upper(btrim(o.sending_bank))=upper(btrim(r.sending_bank))
               )
             )
           ))
       ))
    or exists(select 1 from public.taphoa_agribank_notifications o
       where o.id<>n.id and o.status='credit_candidate' and o.amount_vnd=n.amount_vnd
         and o.transfer_at between n.transfer_at-interval '60 seconds' and n.transfer_at+interval '60 seconds')
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and o.customer_account_id=r.customer_account_id
         and o.status in ('queued','scanning')
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
  if admin is null then return jsonb_build_object('ok',false,'status','admin_missing'); end if;  -- BANK-202: ledger-only auto collection; notifications are not a prerequisite for a verified credit.
  thousands:=transfer_amount/1000;
  -- SPEC-FINANCE-CUSTOMER-LOCK-ALL-CHANNELS-20261101:
  -- Acquire the customer lock BEFORE duplicate detection and receipt snapshot.
  perform pg_advisory_xact_lock(hashtextextended('taphoa-money:' || customer::text,0));
  -- Hold only for a manual/unlinked collection of the same amount near this bank
  -- transfer. An earlier AUTO collection, linked to a DIFFERENT consumed Agribank
  -- notification, must not block an independent transfer of the same amount.
  if exists(
    select 1 from public.taphoa_debt_ledger l
    where l.customer_account_id=customer
      and l.entry_type='collection'
      and l.amount_vnd=-thousands
      and l.created_at between transaction_at-interval '30 minutes' and now()
      and not exists (
        select 1 from public.chat_bank_app_collection_links previous_auto
        where previous_auto.ledger_id=l.id
      )
  ) then
    return jsonb_build_object('ok',false,'status','possible_manual_collection');
  end if;
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
  if coalesce(link,'')<>'' then notice:=notice||E'\nXem công nợ: '||link; end if;  -- BANK-202: customer already provided a bill; no duplicate auto-acknowledgment bubble.
  message_id:=null;

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
$function$

