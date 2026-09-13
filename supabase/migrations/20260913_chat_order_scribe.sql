begin;

create table if not exists public.chat_order_scribe_runtime_settings (
  singleton boolean primary key default true check (singleton),
  model_name text not null default 'gemini-2.5-flash-lite',
  updated_at timestamptz not null default now()
);

insert into public.chat_order_scribe_runtime_settings(singleton,model_name)
values(true,'gemini-2.5-flash-lite')
on conflict(singleton) do nothing;

alter table public.chat_order_scribe_runtime_settings enable row level security;
revoke all on public.chat_order_scribe_runtime_settings from public, anon, authenticated;

create or replace function public.chat_order_scribe_runtime_config()
returns table(model_name text, gemini_api_key text)
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select
    s.model_name,
    coalesce((
      select v.decrypted_secret
      from vault.decrypted_secrets v
      where v.name='getlink_order_agent_gemini_api_key'
      order by v.created_at desc
      limit 1
    ),'') as gemini_api_key
  from public.chat_order_scribe_runtime_settings s
  where s.singleton=true
  limit 1;
$$;

revoke all on function public.chat_order_scribe_runtime_config() from public, anon, authenticated;
grant execute on function public.chat_order_scribe_runtime_config() to service_role;

commit;
