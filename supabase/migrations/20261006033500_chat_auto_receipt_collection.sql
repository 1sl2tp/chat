-- Automatic bank-receipt collection for TAPHOA Chat.
-- Canonical debt data stays in Supabase. New customer image only -> one vision read.
-- Collections may exceed current debt; negative ledger balance is retained as customer credit.
-- Auto-collection requires exact recipient identity:
--   BUI XUAN TUNG / Agribank / 2901181999999
-- Duplicate protection is by transfer timestamp and, when present, transaction reference.

begin;

create table if not exists public.v21_receipt_jobs (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null unique references public.v21_media_assets(id) on delete cascade,
  message_id uuid not null references public.v21_messages(id) on delete cascade,
  conversation_id uuid not null references public.v21_conversations(id) on delete cascade,
  customer_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  admin_account_id uuid not null references public.v21_accounts(id) on delete restrict,
  content_hash text null,
  status text not null default 'queued'
    check (status in ('queued','processing','applied','duplicate','rejected','needs_review','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  bank_name text null,
  recipient_name text null,
  recipient_account text null,
  amount_bank_vnd bigint null,
  amount_ledger numeric null,
  transfer_at timestamptz null,
  transaction_ref text null,
  dedupe_key text null,
  duplicate_of uuid null references public.v21_receipt_jobs(id) on delete set null,
  result_json jsonb not null default '{}'::jsonb,
  error_code text null,
  balance_before numeric null,
  balance_after numeric null,
  ledger_id bigint null references public.taphoa_debt_ledger(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  processed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create unique index if not exists v21_receipt_jobs_applied_dedupe_idx
  on public.v21_receipt_jobs(dedupe_key)
  where status='applied' and dedupe_key is not null;

create index if not exists v21_receipt_jobs_customer_idx
  on public.v21_receipt_jobs(customer_account_id,created_at desc);

alter table public.v21_receipt_jobs enable row level security;
revoke all on public.v21_receipt_jobs from public,anon,authenticated;
grant select,insert,update on public.v21_receipt_jobs to service_role;

CREATE OR REPLACE FUNCTION public.v21_receipt_finalize(p_job_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_job public.v21_receipt_jobs;
  v_message_at timestamptz;
  v_is_receipt boolean;
  v_bank text;
  v_name text;
  v_account text;
  v_amount bigint;
  v_amount_ledger numeric;
  v_transfer_at timestamptz;
  v_tx_ref text;
  v_name_norm text;
  v_account_norm text;
  v_bank_norm text;
  v_ref_norm text;
  v_dedupe text;
  v_duplicate uuid;
  v_balance_before numeric;
  v_balance_after numeric;
  v_ledger_id bigint;
  v_notice_amount text;
begin
  select * into v_job
  from public.v21_receipt_jobs
  where id=p_job_id
  for update;

  if not found then
    raise exception 'receipt_job_not_found';
  end if;

  if v_job.status in ('applied','duplicate','rejected','needs_review') then
    return jsonb_build_object('ok',true,'status',v_job.status,'job_id',v_job.id);
  end if;

  v_is_receipt := coalesce((p_result->>'is_bank_receipt')::boolean,false);
  v_bank := btrim(coalesce(p_result->>'bank_name',''));
  v_name := btrim(coalesce(p_result->>'recipient_name',''));
  v_account := btrim(coalesce(p_result->>'recipient_account',''));
  v_tx_ref := nullif(btrim(coalesce(p_result->>'transaction_ref','')),'');
  v_amount := nullif(btrim(coalesce(p_result->>'amount_vnd','')),'')::bigint;
  v_transfer_at := nullif(btrim(coalesce(p_result->>'transfer_at','')),'')::timestamptz;

  v_name_norm := upper(regexp_replace(unaccent(v_name),'[[:space:]]+',' ','g'));
  v_account_norm := regexp_replace(v_account,'[^0-9]','','g');
  v_bank_norm := upper(unaccent(v_bank));
  v_ref_norm := upper(regexp_replace(coalesce(v_tx_ref,''),'[^A-Z0-9]','','g'));

  update public.v21_receipt_jobs
  set result_json=coalesce(p_result,'{}'::jsonb),
      bank_name=nullif(v_bank,''),
      recipient_name=nullif(v_name,''),
      recipient_account=nullif(v_account,''),
      amount_bank_vnd=v_amount,
      transfer_at=v_transfer_at,
      transaction_ref=v_tx_ref,
      updated_at=now()
  where id=p_job_id;

  if not v_is_receipt then
    update public.v21_receipt_jobs
    set status='rejected',error_code='not_bank_receipt',processed_at=now(),updated_at=now()
    where id=p_job_id;
    return jsonb_build_object('ok',true,'status','rejected','reason','not_bank_receipt');
  end if;

  -- Exact recipient identity contract. Formatting whitespace/case is normalized,
  -- but every name token and every account digit must match the configured owner.
  if v_name_norm <> 'BUI XUAN TUNG' then
    update public.v21_receipt_jobs
    set status='needs_review',error_code='recipient_name_mismatch',processed_at=now(),updated_at=now()
    where id=p_job_id;
    return jsonb_build_object('ok',true,'status','needs_review','reason','recipient_name_mismatch');
  end if;

  if v_account_norm <> '2901181999999' then
    update public.v21_receipt_jobs
    set status='needs_review',error_code='recipient_account_mismatch',processed_at=now(),updated_at=now()
    where id=p_job_id;
    return jsonb_build_object('ok',true,'status','needs_review','reason','recipient_account_mismatch');
  end if;

  if position('AGRIBANK' in v_bank_norm)=0 then
    update public.v21_receipt_jobs
    set status='needs_review',error_code='recipient_bank_mismatch',processed_at=now(),updated_at=now()
    where id=p_job_id;
    return jsonb_build_object('ok',true,'status','needs_review','reason','recipient_bank_mismatch');
  end if;

  if coalesce(v_amount,0)<=0 or mod(v_amount,1000)<>0 then
    update public.v21_receipt_jobs
    set status='needs_review',error_code='amount_invalid',processed_at=now(),updated_at=now()
    where id=p_job_id;
    return jsonb_build_object('ok',true,'status','needs_review','reason','amount_invalid');
  end if;

  select m.created_at into v_message_at
  from public.v21_messages m
  where m.id=v_job.message_id;

  if v_transfer_at is null
     or v_message_at is null
     or v_transfer_at < v_message_at - interval '24 hours'
     or v_transfer_at > v_message_at + interval '10 minutes' then
    update public.v21_receipt_jobs
    set status='needs_review',error_code='transfer_time_mismatch',processed_at=now(),updated_at=now()
    where id=p_job_id;
    return jsonb_build_object('ok',true,'status','needs_review','reason','transfer_time_mismatch');
  end if;

  v_amount_ledger := v_amount / 1000;

  -- Transfer date/time is always unique. Transaction reference, when
  -- present, is a second independent duplicate key.
  v_dedupe := 'agribank:2901181999999:at:'
    || to_char(v_transfer_at at time zone 'Asia/Ho_Chi_Minh','YYYYMMDDHH24MISS');

  perform pg_advisory_xact_lock(hashtextextended(v_dedupe,0));
  if v_ref_norm<>'' then
    perform pg_advisory_xact_lock(hashtextextended('agribank:ref:'||v_ref_norm,0));
  end if;

  select j.id into v_duplicate
  from public.v21_receipt_jobs j
  where j.id<>p_job_id
    and j.status='applied'
    and (
      j.dedupe_key=v_dedupe
      or (
        v_ref_norm<>''
        and upper(regexp_replace(coalesce(j.transaction_ref,''),'[^A-Z0-9]','','g'))=v_ref_norm
      )
    )
  order by j.processed_at asc nulls last,j.created_at asc
  limit 1;

  if v_duplicate is not null then
    update public.v21_receipt_jobs
    set status='duplicate',duplicate_of=v_duplicate,error_code='duplicate_receipt',
        amount_ledger=v_amount_ledger,processed_at=now(),updated_at=now()
    where id=p_job_id;
    return jsonb_build_object('ok',true,'status','duplicate','duplicate_of',v_duplicate);
  end if;

  v_balance_before := public.taphoa_chat_customer_balance_value(v_job.customer_account_id);

  insert into public.taphoa_debt_ledger(
    customer_account_id,entry_type,amount_vnd,note,created_by_account_id
  )
  values(
    v_job.customer_account_id,
    'collection',
    -v_amount_ledger,
    'Tự nhận bill Agribank 2901181999999'
      || case when v_tx_ref is not null then ' · MGD '||left(v_tx_ref,80) else '' end
      || ' · '||to_char(v_transfer_at at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI'),
    v_job.admin_account_id
  )
  returning id into v_ledger_id;

  perform public.taphoa_bump_revision('debt');

  v_balance_after := public.taphoa_chat_customer_balance_value(v_job.customer_account_id);
  v_notice_amount := public.taphoa_chat_money(v_amount_ledger);

  perform public.taphoa_chat_notify_customer(
    v_job.customer_account_id,
    v_job.admin_account_id,
    'taphoa:receipt:'||v_job.id::text||':collection',
    'Đã thu '||v_notice_amount
  );

  update public.v21_receipt_jobs
  set status='applied',
      amount_ledger=v_amount_ledger,
      dedupe_key=v_dedupe,
      balance_before=v_balance_before,
      balance_after=v_balance_after,
      ledger_id=v_ledger_id,
      error_code=null,
      processed_at=now(),
      updated_at=now()
  where id=p_job_id;

  return jsonb_build_object(
    'ok',true,'status','applied','job_id',p_job_id,
    'amount',v_amount_ledger,'balance_before',v_balance_before,'balance_after',v_balance_after
  );
exception
  when unique_violation then
    update public.v21_receipt_jobs
    set status='duplicate',error_code='duplicate_receipt',processed_at=now(),updated_at=now()
    where id=p_job_id;
    return jsonb_build_object('ok',true,'status','duplicate','reason','unique_dedupe');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.v21_receipt_media_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_message public.v21_messages;
  v_conversation public.v21_conversations;
  v_customer public.v21_accounts;
  v_admin public.v21_accounts;
  v_other_id uuid;
  v_job_id uuid;
begin
  if new.kind<>'image'
     or new.deleted_at is not null
     or new.message_id is null
     or coalesce(new.storage_key,'')='' then
    return new;
  end if;

  select * into v_message
  from public.v21_messages m
  where m.id=new.message_id and m.deleted_at is null;

  if not found then return new; end if;

  select * into v_customer
  from public.v21_accounts a
  where a.id=v_message.sender_account_id
    and a.role='user'
    and a.contact_group='customer'
    and a.deleted_at is null
    and a.locked_at is null;

  if not found then return new; end if;

  select * into v_conversation
  from public.v21_conversations c
  where c.id=v_message.conversation_id;

  if not found then return new; end if;

  v_other_id := case
    when v_conversation.member_a=v_customer.id then v_conversation.member_b
    when v_conversation.member_b=v_customer.id then v_conversation.member_a
    else null
  end;

  if v_other_id is null then return new; end if;

  select * into v_admin
  from public.v21_accounts a
  where a.id=v_other_id
    and a.role='admin'
    and a.deleted_at is null
    and a.locked_at is null;

  if not found then return new; end if;

  insert into public.v21_receipt_jobs(
    media_asset_id,message_id,conversation_id,
    customer_account_id,admin_account_id,content_hash
  )
  values(
    new.id,new.message_id,new.conversation_id,
    v_customer.id,v_admin.id,new.content_hash
  )
  on conflict(media_asset_id) do nothing
  returning id into v_job_id;

  if v_job_id is not null then
    perform public.v21_receipt_scan_enqueue_http(v_job_id);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.v21_receipt_scan_enqueue_http(p_job_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  v_key text;
  v_gemini_key text;
  v_request_id bigint;
begin
  if p_job_id is null then return null; end if;

  select rc.scan_key,rc.gemini_api_key
    into v_key,v_gemini_key
  from public.chat_customer_summary_runtime_config() rc
  limit 1;

  if coalesce(v_key,'')='' or coalesce(v_gemini_key,'')='' then
    return null;
  end if;

  select net.http_post(
    url := 'https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-receipt-scan',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-receipt-scan-key',v_key
    ),
    body := jsonb_build_object('job_id',p_job_id::text),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$function$
;

drop trigger if exists v21_receipt_media_detect on public.v21_media_assets;
create trigger v21_receipt_media_detect
after insert or update of message_id,deleted_at,kind,storage_key on public.v21_media_assets
for each row execute function public.v21_receipt_media_trigger();

revoke all on function public.v21_receipt_scan_enqueue_http(uuid) from public,anon,authenticated;
grant execute on function public.v21_receipt_scan_enqueue_http(uuid) to postgres,service_role;
revoke all on function public.v21_receipt_finalize(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.v21_receipt_finalize(uuid,jsonb) to service_role;

commit;
