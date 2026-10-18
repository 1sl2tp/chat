-- SPEC-CHAT-BANK-AUTOCOLLECT-157
-- Backend switch foundation: OFF + not-ready by default. No ledger writer/cron.
begin;
create table if not exists public.chat_auto_collect_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  ready boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_account_id uuid references public.v21_accounts(id)
);
insert into public.chat_auto_collect_settings(singleton,enabled,ready)
values(true,false,false) on conflict(singleton) do nothing;
alter table public.chat_auto_collect_settings enable row level security;
revoke all on table public.chat_auto_collect_settings from public, anon, authenticated;

create or replace function public.chat_auto_collect_admin_settings(p_enabled boolean default null)
returns jsonb language plpgsql security definer
set search_path to 'public','v21_private','pg_temp'
as $f$
declare
 v_actor uuid := v21_private.current_active_account_id();
 v_config public.chat_auto_collect_settings%rowtype;
begin
 if v_actor is null or not exists(
   select 1 from public.v21_accounts a where a.id=v_actor and a.role='admin'
      and a.deleted_at is null and a.locked_at is null
 ) then
   raise exception 'admin_required' using errcode='42501';
 end if;
 select * into v_config
 from public.chat_auto_collect_settings where singleton=true for update;
 if not found then raise exception 'auto_collect_config_missing'; end if;
 if p_enabled is not null then
   if p_enabled and not v_config.ready then
      raise exception 'auto_collect_not_ready' using errcode='P0001';
   end if;
   if v_config.enabled is distinct from p_enabled then
     update public.chat_auto_collect_settings
        set enabled=p_enabled,updated_at=now(),updated_by_account_id=v_actor
      where singleton=true returning * into v_config;
   end if;
 end if;
 return jsonb_build_object(
  'ok',true,'enabled',v_config.enabled,'ready',v_config.ready,
  'updated_at',v_config.updated_at,'can_enable',v_config.ready
 );
end
$f$;
revoke all on function public.chat_auto_collect_admin_settings(boolean) from public, anon;
grant execute on function public.chat_auto_collect_admin_settings(boolean) to authenticated;
commit;
