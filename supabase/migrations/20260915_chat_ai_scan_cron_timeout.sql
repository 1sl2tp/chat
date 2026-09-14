begin;

create or replace function public.chat_ai_scan_enqueue_http()
returns bigint
language plpgsql
security definer
set search_path = public,vault,pg_temp
as $$
declare
  v_key text;
  v_request_id bigint;
begin
  select v.decrypted_secret into v_key
  from vault.decrypted_secrets v
  where v.name='chat_ai_scan_cron_key'
  order by v.created_at desc
  limit 1;

  if coalesce(v_key,'')='' then
    raise exception 'scan_key_missing';
  end if;

  select net.http_post(
    url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-order-scan',
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-order-scan-key',v_key
    ),
    body := '{"trigger":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.chat_ai_scan_enqueue_http() from public,anon,authenticated;

commit;
