-- Replace generative-AI receipt scanning with deterministic OCR on the existing
-- Render bridge. Only KH accounts are eligible. No polling or background scan.
-- Historical function name v21_receipt_scan_enqueue_http is retained so the
-- existing media trigger does not need a second owner.

begin;

CREATE OR REPLACE FUNCTION public.v21_receipt_scan_enqueue_http(p_job_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'pg_temp'
AS $function$
declare
  v_token_hash text;
  v_request_id bigint;
  v_is_kh boolean;
begin
  if p_job_id is null then return null; end if;

  select exists(
    select 1
    from public.v21_receipt_jobs j
    join public.v21_accounts a on a.id=j.customer_account_id
    where j.id=p_job_id
      and j.status in ('queued','failed')
      and a.role='user'
      and a.contact_group='customer'
      and a.deleted_at is null
      and a.locked_at is null
  ) into v_is_kh;

  if not coalesce(v_is_kh,false) then
    return null;
  end if;

  select token_sha256 into v_token_hash
  from public.v21_zalo_bridge_auth
  where id='primary';

  if length(coalesce(v_token_hash,''))<>64 then
    return null;
  end if;

  select net.http_post(
    url := 'https://taphoa-zalo.onrender.com/receipt-ocr',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-bridge-token-sha256',v_token_hash
    ),
    body := jsonb_build_object('job_id',p_job_id::text),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$function$;

revoke all on function public.v21_receipt_scan_enqueue_http(uuid) from public,anon,authenticated;
grant execute on function public.v21_receipt_scan_enqueue_http(uuid) to postgres,service_role;

CREATE OR REPLACE FUNCTION public.v21_receipt_finalize_kh(p_job_id uuid,p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_is_kh boolean;
  v_status text;
begin
  select j.status,
         (
           a.role='user'
           and a.contact_group='customer'
           and a.deleted_at is null
           and a.locked_at is null
         )
    into v_status,v_is_kh
  from public.v21_receipt_jobs j
  join public.v21_accounts a on a.id=j.customer_account_id
  where j.id=p_job_id
  for update of j;

  if v_status is null then
    raise exception 'receipt_job_not_found';
  end if;

  if not coalesce(v_is_kh,false) then
    if v_status not in ('applied','duplicate','rejected','needs_review') then
      update public.v21_receipt_jobs
      set status='rejected',
          error_code='customer_group_not_kh',
          processed_at=now(),
          updated_at=now()
      where id=p_job_id;
    end if;
    return jsonb_build_object('ok',true,'status','rejected','reason','customer_group_not_kh');
  end if;

  return public.v21_receipt_finalize(p_job_id,coalesce(p_result,'{}'::jsonb));
end;
$function$;

revoke all on function public.v21_receipt_finalize_kh(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.v21_receipt_finalize_kh(uuid,jsonb) to service_role;

commit;
