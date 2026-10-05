create or replace function public.chat_customer_summary_scan_enqueue_http()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'vault', 'pg_temp'
as $function$
declare
  v_key text;
  v_gemini_key text;
  v_request_id bigint;
begin
  select rc.scan_key, rc.gemini_api_key
    into v_key, v_gemini_key
  from public.chat_customer_summary_runtime_config() rc
  limit 1;

  if coalesce(v_key,'') = '' then
    return null;
  end if;

  -- Resource guard: if AI is not configured, do not enqueue a pg_net
  -- request that can only return 503. Dispatch resumes automatically
  -- when the runtime key becomes available again.
  if coalesce(v_gemini_key,'') = '' then
    return null;
  end if;

  select net.http_post(
    url := 'https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-customer-summary-scan',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-customer-summary-key',v_key
    ),
    body := '{"trigger":"event"}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$function$;
