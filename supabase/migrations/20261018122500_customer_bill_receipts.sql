-- Chat bill OCR beta. Only new, user-sent images processed by Admin in an active Chat session.
-- A bill is NOT an authoritative bank statement. This explicitly follows the owner's
-- opt-in policy of recording a fully validated bill as a collection without bank reconciliation.
-- No cron, Storage trigger, provider API or scan of old messages.
begin;

create table if not exists public.chat_bank_bill_receipts (
  id bigint generated always as identity primary key,
  customer_account_id uuid not null references public.v21_accounts(id),
  media_asset_id uuid not null unique references public.v21_media_assets(id),
  message_id uuid not null references public.v21_messages(id),
  image_sha256 text,
  image_size_bytes bigint,
  image_width_px integer,
  image_height_px integer,
  sending_bank text,
  receiving_bank text,
  receiving_account text,
  receiving_name text,
  payer_name text,
  transfer_memo text,
  transfer_reference text,
  transfer_at timestamptz,
  amount_vnd bigint,
  ledger_id bigint unique references public.taphoa_debt_ledger(id),
  status text not null check (status in ('received','duplicate','review','hold')),
  reason text not null default '',
  duplicate_of bigint references public.chat_bank_bill_receipts(id),
  created_by_account_id uuid not null references public.v21_accounts(id),
  created_at timestamptz not null default now(),
  constraint bank_bill_amount_valid check (amount_vnd is null or (amount_vnd>0 and amount_vnd<1000000000000)),
  constraint bank_bill_hash_valid check (image_sha256 is null or image_sha256 ~ '^[0-9a-f]{64}$')
);
create index if not exists chat_bank_bill_customer_idx on public.chat_bank_bill_receipts(customer_account_id,created_at desc);
create unique index if not exists chat_bank_bill_received_ref_unique
  on public.chat_bank_bill_receipts(lower(btrim(sending_bank)), upper(btrim(transfer_reference)))
  where status='received' and transfer_reference is not null;
create unique index if not exists chat_bank_bill_received_sha_unique
  on public.chat_bank_bill_receipts(image_sha256)
  where status='received' and image_sha256 is not null;

alter table public.chat_bank_bill_receipts enable row level security;
revoke all on public.chat_bank_bill_receipts from public,anon,authenticated;
grant all on public.chat_bank_bill_receipts to postgres,service_role;
revoke all on sequence public.chat_bank_bill_receipts_id_seq from public,anon,authenticated;
grant all on sequence public.chat_bank_bill_receipts_id_seq to postgres,service_role;

create or replace function public.v21_admin_bank_bill_record(
  p_asset_id uuid,
  p_image_sha256 text,
  p_sending_bank text,
  p_receiving_bank text,
  p_receiving_account text,
  p_receiving_name text,
  p_payer_name text,
  p_transfer_memo text,
  p_transfer_reference text,
  p_transfer_at timestamptz,
  p_amount_vnd bigint,
  p_success boolean
)
returns jsonb language plpgsql security definer
set search_path = public,v21_private,pg_temp
as $f$
declare
  v_actor uuid := v21_private.current_active_account_id();
  v_source record;
  v_hash text := lower(nullif(btrim(coalesce(p_image_sha256,'')),''));
  v_bank text := nullif(btrim(coalesce(p_sending_bank,'')),'');
  v_ref text := nullif(btrim(coalesce(p_transfer_reference,'')),'');
  v_acct text := regexp_replace(coalesce(p_receiving_account,''),'[^0-9]','','g');
  v_name text := upper(regexp_replace(btrim(coalesce(p_receiving_name,'')),'\\s+',' ','g'));
  v_destination text := lower(btrim(coalesce(p_receiving_bank,'')));
  v_status text := 'received';
  v_reason text := '';
  v_duplicate_id bigint;
  v_id bigint;
  v_ledger bigint;
  v_prior record;
begin
  if v_actor is null or not exists(
    select 1 from public.v21_accounts a
    where a.id=v_actor and a.role='admin'
      and a.deleted_at is null and a.locked_at is null
  ) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_asset_id is null then raise exception 'asset_required'; end if;

  -- Serialize the small admin collection path: parallel devices must never
  -- create two ledger rows for one transfer.
  perform pg_advisory_xact_lock(hashtext('chat_bank_bill_receipt_v1'));

  select a.id as asset_id, a.message_id, m.sender_account_id, m.created_at as sent_at,
         a.size_bytes, a.width_px, a.height_px
  into v_source
  from public.v21_media_assets a
  join public.v21_messages m on m.id=a.message_id and m.deleted_at is null
  join public.v21_accounts s on s.id=m.sender_account_id
  where a.id=p_asset_id and a.kind='image' and a.deleted_at is null
    and m.sender_account_id=a.owner_account_id
    and s.role='user' and s.contact_group='customer'
    and s.deleted_at is null and s.locked_at is null;

  if not found then raise exception 'customer_image_not_found' using errcode='42501'; end if;

  select id,status,reason,ledger_id into v_prior
  from public.chat_bank_bill_receipts where media_asset_id=p_asset_id;
  if found then return jsonb_build_object(
    'id',v_prior.id,'status',v_prior.status,'reason',v_prior.reason,
    'ledger_id',v_prior.ledger_id,'replayed',true
  ); end if;

  if v_hash is not null and v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_image_hash';
  end if;
  if p_amount_vnd is null or p_amount_vnd<=0 or p_amount_vnd>1000000000000
     or p_amount_vnd % 1000 <> 0 then
    v_status:='review'; v_reason:='amount_missing_or_not_exact_thousands';
  elsif p_transfer_at is null or not coalesce(p_success,false) then
    v_status:='review'; v_reason:='transaction_time_or_success_missing';
  elsif v_ref is not null and length(v_ref)<5 then
    v_status:='review'; v_reason:='reference_unclear';
  elsif v_ref is null and v_hash is null then
    v_status:='review'; v_reason:='no_reference_and_no_verified_image_hash';
  elsif v_name<>'BUI XUAN TUNG'
     or not (
       (v_acct='2901181999999' and (v_destination like '%agribank%' or v_destination like '%nong nghiep%'))
       or (v_acct='197981999999' and v_destination like '%vietinbank%')
     ) then
    v_status:='hold'; v_reason:='wrong_or_masked_recipient';
  elsif (p_transfer_at at time zone 'Asia/Ho_Chi_Minh')::date
        <> (v_source.sent_at at time zone 'Asia/Ho_Chi_Minh')::date
     or p_transfer_at > v_source.sent_at + interval '5 minutes' then
    v_status:='hold'; v_reason:='transfer_date_not_image_sent_date_vn';
  end if;

  -- Identical bytes or bank+transaction reference are duplicate indicators
  -- across ALL customers. With no reference, amount+time+recipient can only
  -- trigger REVIEW: unrelated payments may have the same amount/time.
  -- Image dimensions and byte size are informational only (never a unique key).
  if v_hash is not null then
    select id into v_duplicate_id from public.chat_bank_bill_receipts
    where image_sha256=v_hash and status='received' order by id limit 1;
  end if;
  if v_duplicate_id is null and v_bank is not null and v_ref is not null then
    select id into v_duplicate_id from public.chat_bank_bill_receipts
    where lower(btrim(sending_bank))=lower(v_bank)
      and upper(btrim(transfer_reference))=upper(v_ref)
      and status='received' order by id limit 1;
  end if;
  if v_duplicate_id is not null then
    v_status:='duplicate'; v_reason:='duplicate_bank_reference_or_image';
  elsif v_status='received' and exists (
    select 1 from public.chat_bank_bill_receipts r
    where r.status='received' and r.amount_vnd=p_amount_vnd
      and date_trunc('minute',r.transfer_at)=date_trunc('minute',p_transfer_at)
      and r.receiving_account=v_acct and r.receiving_name=v_name
      and (v_ref is null or r.transfer_reference is null
           or upper(btrim(r.transfer_reference))=upper(btrim(v_ref)))
  ) then
    v_status:='review'; v_reason:='suspected_duplicate_same_amount_time_recipient';
  end if;

  insert into public.chat_bank_bill_receipts(
    customer_account_id,media_asset_id,message_id,image_sha256,
    image_size_bytes,image_width_px,image_height_px,sending_bank,
    receiving_bank,receiving_account,receiving_name,payer_name,transfer_memo,
    transfer_reference,transfer_at,amount_vnd,status,reason,duplicate_of,created_by_account_id
  ) values (
    v_source.sender_account_id,p_asset_id,v_source.message_id,v_hash,
    v_source.size_bytes,v_source.width_px,v_source.height_px,left(v_bank,100),left(btrim(coalesce(p_receiving_bank,'')),100),v_acct,
    left(v_name,120),left(btrim(coalesce(p_payer_name,'')),160),
    left(btrim(coalesce(p_transfer_memo,'')),500),left(v_ref,160),
    p_transfer_at,p_amount_vnd,v_status,v_reason,v_duplicate_id,v_actor
  ) returning id into v_id;

  if v_status='received' then
    insert into public.taphoa_debt_ledger(
      customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id
    ) values (
      v_source.sender_account_id,null,'collection',-(p_amount_vnd/1000),
      'Đã thu bill CK ' || coalesce(left(v_bank,40),'không rõ bank gửi') || ' · ' || coalesce(left(v_ref,95),'không có mã GD'),
      v_actor
    ) returning id into v_ledger;
    update public.chat_bank_bill_receipts set ledger_id=v_ledger where id=v_id;
  end if;
  return jsonb_build_object('id',v_id,'status',v_status,'reason',v_reason,
    'ledger_id',v_ledger,'amount_thousands',case when v_status='received' then p_amount_vnd/1000 else null end,
    'replayed',false,'duplicate_of',v_duplicate_id);
end
$f$;

revoke all on function public.v21_admin_bank_bill_record(
uuid,text,text,text,text,text,text,text,text,timestamptz,bigint,boolean
) from public,anon;
grant execute on function public.v21_admin_bank_bill_record(
uuid,text,text,text,text,text,text,text,text,timestamptz,bigint,boolean
) to authenticated,service_role;
commit;
