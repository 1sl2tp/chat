-- Restore summary runtime config from already-migrated Vault secrets.
create or replace function public.chat_customer_summary_runtime_config()
returns table(scan_key text,model_name text,gemini_api_key text)
language sql
security definer
set search_path=public,vault,pg_temp
as $$
  select
    coalesce((
      select decrypted_secret from vault.decrypted_secrets
      where name='chat_ai_scan_cron_key'
      order by created_at desc limit 1
    ),'')::text,
    'gemini-3.5-flash-lite'::text,
    coalesce((
      select decrypted_secret from vault.decrypted_secrets
      where name='getlink_order_agent_gemini_api_key'
      order by created_at desc limit 1
    ),'')::text;
$$;

revoke all on function public.chat_customer_summary_runtime_config() from public,anon,authenticated;
grant execute on function public.chat_customer_summary_runtime_config() to service_role;