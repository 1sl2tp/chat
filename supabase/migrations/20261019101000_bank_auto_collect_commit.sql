-- BANK-161: A validated, service-only bank transfer maps to one standard TAPHOA collection.
-- Never change the existing manual taphoa_debt_transaction.
begin;
create table if not exists public.chat_bank_auto_collection_links(
 receipt_id uuid primary key references public.chat_bank_bill_receipts(id),
 sms_id bigint not null unique references public.taphoa_sms_inbox(id),
 ledger_id bigint not null unique references public.taphoa_debt_ledger(id),
 command_id uuid not null unique,
 created_at timestamptz not null default now()
);
alter table public.chat_bank_auto_collection_links enable row level security;
revoke all on public.chat_bank_auto_collection_links from public,anon,authenticated;

create or replace function public.chat_bank_auto_collect_commit(p_asset_id uuid,p_sms_id bigint)
returns jsonb language plpgsql security definer
set search_path to 'public','v21_private','pg_temp'
as $fn$
declare
  v_r public.chat_bank_bill_receipts%rowtype;
  v_s public.taphoa_sms_inbox%rowtype;
  v_settings public.chat_auto_collect_settings%rowtype;
  v_match text[];
  v_time text;
  v_account text;
  v_amount numeric;
  v_units numeric;
  v_y integer;
  v_m integer;
  v_d integer;
  v_h integer;
  v_min integer;
  v_year integer;
  v_tx timestamptz;
  v_candidate timestamptz;
  v_diff numeric := 1e18;
  v_bill_tx timestamptz;
  v_admin uuid;
  v_before numeric;
  v_after numeric;
  v_ledger bigint;
  v_notice text;
  v_note text := 'Chuyển khoản tự động';
  v_link text;
  v_msg_id uuid;
  v_result jsonb;
  v_conflicts integer;
  v_other record;
  v_other_amount text[];
begin
  -- A single payment from SMS and a bill must be globally serializable.
  perform pg_advisory_xact_lock(17812026);
  select * into v_settings from public.chat_auto_collect_settings where singleton=true for update;
  if not found or not(v_settings.enabled and v_settings.ready) then
    return jsonb_build_object('ok',false,'status','disabled_or_not_ready','ledger_written',false);
  end if;
  if p_asset_id is null or p_sms_id is null then
    return jsonb_build_object('ok',false,'status','evidence_missing','ledger_written',false);
  end if;
  select * into v_r from public.chat_bank_bill_receipts
    where media_asset_id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'status','bill_missing','ledger_written',false); end if;
  if v_r.status='received' and v_r.ledger_id is not null then
    select result into v_result from public.taphoa_command_log where command_id=v_r.id;
    return jsonb_build_object('ok',true,'status','received','ledger_written',true,
      'replayed',true,'ledger_id',v_r.ledger_id,'receipt',v_result);
  end if;
  if v_r.status<>'amount_read' or v_r.ledger_id is not null
      or v_r.amount_vnd is null or v_r.amount_vnd<=0
      or mod(v_r.amount_vnd,1000)<>0 or v_r.amount_vnd>=1000000000000
      or v_r.image_sha256 is null or v_r.model_name is null
      or v_r.transfer_at_vn is null or v_r.scanned_at is null
      or v_r.scanned_at < now()-interval '48 hours'
      or v_r.raw_read->>'rule_version'<>'bank_bill_amount_v4_20261018'
      or v_r.raw_read->>'transfer_success_visible'<>'true'
      or v_r.raw_read->>'amount_clear'<>'true'
      or v_r.raw_read->>'transaction_nature' not in ('transfer','incoming_transfer')
      or v_r.raw_read->>'transaction_selection' not in ('latest_top_row','single_detail')
      or v_r.raw_read#>>'{match_preview,status}'<>'candidate_unique'
      or v_r.raw_read#>>'{match_preview,sms_id}' is distinct from p_sms_id::text
   then return jsonb_build_object('ok',false,'status','bill_not_verified','ledger_written',false);
  end if;
  select * into v_s from public.taphoa_sms_inbox where id=p_sms_id for update;
  if not found or v_s.sender !~* '^(AGRIBANK|[A-Z]{2}-AGRIBANK)$'
    or v_s.created_at<now()-interval '48 hours'
    or not exists (select 1 from public.taphoa_sms_ingest_devices d where d.id=v_s.device_id and d.active=true)
  then return jsonb_build_object('ok',false,'status','bank_sms_invalid','ledger_written',false); end if;
  if upper(v_s.body) ~ '(OTP|MA XAC THUC|MAT KHAU|PASSWORD|MA PIN|TRA LAI|TIEN LAI|HOAN TIEN|HOAN PHI)'
  then return jsonb_build_object('ok',false,'status','bank_sms_rejected','ledger_written',false); end if;
  -- Parse ONLY signed positive amount adjacent to recipient account; never SD/balance.
  v_match:=regexp_match(upper(v_s.body),
     'TK[[:space:]]*([0-9]{9,20})[[:space:]]*:[[:space:]]*\\+[[:space:]]*([0-9][0-9.,]*)[[:space:]]*VND');
  if v_match is null or v_match[2] !~ '(^[0-9]{1,12}$|^[0-9]{1,3}([.,][0-9]{3})+$)'
  then return jsonb_build_object('ok',false,'status','bank_amount_unreadable','ledger_written',false); end if;
  v_account:=v_match[1];
  v_amount:=replace(replace(v_match[2],'.',''),',','')::numeric;
  v_units:=v_amount/1000;
  if v_amount<>v_r.amount_vnd or mod(v_amount,1000)<>0 or v_amount<=0
  then return jsonb_build_object('ok',false,'status','amount_mismatch','ledger_written',false); end if;
  -- This is the bank-owner destination already locked in the current V4 bill pilot.
  if v_account<>'2901181999999'
     or upper(btrim(coalesce(v_r.receiving_name,'')))<>'BUI XUAN TUNG'
     or upper(btrim(coalesce(v_r.receiving_bank,'')))<>'AGRIBANK'
     or right(coalesce(nullif(regexp_replace(v_r.receiving_account,'[^0-9]','','g'),''),
       v_r.raw_read->>'recipient_account_last5',''),5)<>right(v_account,5)
     or (v_r.receiving_account is not null and v_r.receiving_account ~ '^[0-9]{9,20}$'
         and v_r.receiving_account<>v_account)
  then return jsonb_build_object('ok',false,'status','recipient_not_verified','ledger_written',false); end if;
  v_time:=substring(v_s.body from '[0-2][0-9]:[0-5][0-9][[:space:]]+[0-3][0-9]/[0-1][0-9]');
  if v_time is null then return jsonb_build_object('ok',false,'status','sms_time_missing','ledger_written',false); end if;
  v_h:=split_part(split_part(v_time,' ',1),':',1)::integer;
  v_min:=split_part(split_part(v_time,' ',1),':',2)::integer;
  v_d:=split_part(split_part(v_time,' ',2),'/',1)::integer;
  v_m:=split_part(split_part(v_time,' ',2),'/',2)::integer;
  if v_h>23 or v_min>59 or v_d not between 1 and 31 or v_m not between 1 and 12
  then return jsonb_build_object('ok',false,'status','sms_time_invalid','ledger_written',false); end if;
  v_y:=extract(year from v_s.received_at at time zone 'Asia/Ho_Chi_Minh')::integer;
  for v_year in v_y-1..v_y+1 loop
    begin
      v_candidate:=make_timestamp(v_year,v_m,v_d,v_h,v_min,0) at time zone 'Asia/Ho_Chi_Minh';
      if abs(extract(epoch from(v_candidate-v_s.received_at)))<v_diff then
        v_diff:=abs(extract(epoch from(v_candidate-v_s.received_at)));
        v_tx:=v_candidate;
      end if;
    exception when datetime_field_overflow then
      null;
    end;
  end loop;
  if v_tx is null or v_diff>86400
  then return jsonb_build_object('ok',false,'status','sms_time_untrusted','ledger_written',false); end if;
  v_bill_tx:=v_r.transfer_at_vn at time zone 'Asia/Ho_Chi_Minh';
  if abs(extract(epoch from(v_bill_tx-v_tx)))>300
     or v_bill_tx>v_r.sent_at+interval '2 minutes'
     or v_r.sent_at-v_bill_tx>interval '20 minutes'
     or v_s.received_at<v_tx-interval '3 minutes'
     or v_s.received_at>v_r.sent_at+interval '10 minutes'
     or v_r.sent_at<v_tx-interval '2 minutes'
     or v_r.sent_at-v_tx>interval '20 minutes'
  then return jsonb_build_object('ok',false,'status','time_mismatch','ledger_written',false); end if;
  -- Prevent reuse, duplicates, and ambiguous candidates across all customers.
  if exists(select 1 from public.chat_bank_auto_collection_links a
      where a.sms_id=p_sms_id or a.receipt_id=v_r.id)
     or exists(select 1 from public.chat_bank_bill_receipts r2
      where r2.id<>v_r.id and r2.amount_vnd=v_amount
        and r2.transfer_at_vn between v_r.transfer_at_vn-interval '5 minutes'
                                     and v_r.transfer_at_vn+interval '5 minutes'
        and r2.status in ('amount_read','review','received','historical_reference'))
     or exists(select 1 from public.chat_bank_bill_receipts r2
      where r2.id<>v_r.id and r2.image_sha256=v_r.image_sha256)
  then return jsonb_build_object('ok',false,'status','duplicate_or_ambiguous_bill','ledger_written',false); end if;
  -- Reject other same-account, same-amount SMS in the transaction window.
  select count(*) into v_conflicts
  from public.taphoa_sms_inbox s2
  where s2.id<>v_s.id and s2.sender ~* '^(AGRIBANK|[A-Z]{2}-AGRIBANK)$'
    and s2.received_at between v_s.received_at-interval '5 minutes'
                           and v_s.received_at+interval '5 minutes'
    and s2.body ~ 'TK[[:space:]]*2901181999999[[:space:]]*:'
    and regexp_replace(coalesce((regexp_match(upper(s2.body),
     'TK[[:space:]]*([0-9]{9,20})[[:space:]]*:[[:space:]]*\\+[[:space:]]*([0-9][0-9.,]*)[[:space:]]*VND'))[2],''),'[.,]','','g')=v_amount::bigint::text;
  if v_conflicts>0 then
    return jsonb_build_object('ok',false,'status','ambiguous_bank_sms','ledger_written',false);
  end if;
  -- Manual entries can be posted concurrently; hold if a likely manual collection exists.
  if exists(select 1 from public.taphoa_debt_ledger l
     where l.customer_account_id=v_r.customer_account_id
       and l.entry_type='collection' and l.amount_vnd=-v_units
       and l.created_at between v_r.sent_at-interval '30 minutes' and now())
  then return jsonb_build_object('ok',false,'status','possible_manual_collection','ledger_written',false); end if;
  if not exists(select 1 from public.v21_messages m
      join public.v21_media_assets a on a.message_id=m.id
      join public.v21_accounts c on c.id=m.sender_account_id
      where m.id=v_r.message_id and a.id=v_r.media_asset_id and a.deleted_at is null
        and m.deleted_at is null and c.id=v_r.customer_account_id
        and c.role='user' and c.contact_group='customer'
        and c.deleted_at is null and c.locked_at is null)
  then return jsonb_build_object('ok',false,'status','customer_bill_invalid','ledger_written',false); end if;
  select a.id into v_admin
  from public.v21_messages m
    join public.v21_conversations c on c.id=m.conversation_id
    join public.v21_accounts a on a.id=case
      when c.member_a=v_r.customer_account_id then c.member_b else c.member_a end
  where m.id=v_r.message_id and a.role='admin' and a.deleted_at is null and a.locked_at is null
  limit 1;
  if v_admin is null then return jsonb_build_object('ok',false,'status','admin_missing','ledger_written',false); end if;
  -- Stable receipt ID is TAPHOA's idempotent command ID; SQL transaction is all-or-nothing.
  if exists(select 1 from public.taphoa_command_log where command_id=v_r.id)
  then return jsonb_build_object('ok',false,'status','command_id_conflict','ledger_written',false); end if;
  v_before:=public.taphoa_chat_customer_balance_value(v_r.customer_account_id);
  insert into public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
    values(v_r.customer_account_id,'collection',-v_units,v_note,v_admin)
    returning id into v_ledger;
  perform public.taphoa_bump_revision('debt');
  v_after:=public.taphoa_chat_customer_balance_value(v_r.customer_account_id);
  v_notice:='✅ Đã thu · '||public.taphoa_chat_money(v_units)
    || E'\n'||public.taphoa_chat_balance_label(v_before,true)
    || E'\n'||public.taphoa_chat_balance_label(v_after,false)
    || E'\nGhi chú: '||v_note;
  v_link:=public.taphoa_customer_mini_link(v_r.customer_account_id,'no',null,null,null);
  if coalesce(v_link,'')<>'' then v_notice:=v_notice||E'\nXem công nợ: '||v_link; end if;
  v_msg_id:=public.taphoa_chat_notify_customer(v_r.customer_account_id,v_admin,
     'taphoa:'||v_r.id::text||':collection',v_notice);
  v_result:=jsonb_build_object('ok',true,
    'customer_id',v_r.customer_account_id::text,
    'movement',-v_units,
    'receipt_kind','collection',
    'amount_vnd',v_units,
    'balance_before_vnd',v_before,
    'balance_after_vnd',v_after,
    'receipt_note',v_note,
    'receipt_at',now(),
    'notice_sent',v_msg_id is not null,
    'notice_command_id',v_r.id::text);
  insert into public.taphoa_command_log(command_id,operation,result)
    values(v_r.id,'debt_transaction',v_result);
  insert into public.chat_bank_auto_collection_links(receipt_id,sms_id,ledger_id,command_id)
    values(v_r.id,v_s.id,v_ledger,v_r.id);
  update public.chat_bank_bill_receipts
    set status='received',reason='matched_sms_bill_collected',
      ledger_id=v_ledger,balance_before_thousands=v_before,balance_after_thousands=v_after
    where id=v_r.id and status='amount_read';
  return jsonb_build_object('ok',true,'status','received','ledger_written',true,
     'ledger_id',v_ledger,'receipt',v_result,'sms_id',v_s.id);
end;
$fn$;
revoke all on function public.chat_bank_auto_collect_commit(uuid,bigint) from public,anon,authenticated;
grant execute on function public.chat_bank_auto_collect_commit(uuid,bigint) to service_role;
commit;
