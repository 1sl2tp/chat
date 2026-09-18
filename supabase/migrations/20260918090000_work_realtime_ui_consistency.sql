-- Work summary realtime is readable only by the currently active Admin session.
create or replace function v21_private.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public','v21_private','auth'
as $$
  select exists(
    select 1
    from public.v21_accounts a
    where a.id=v21_private.current_active_account_id()
      and a.role='admin'
      and a.deleted_at is null
      and a.locked_at is null
      and a.auth_user_id=auth.uid()
  )
$$;

revoke all on function v21_private.is_current_admin() from public, anon;
grant execute on function v21_private.is_current_admin() to authenticated;

grant select on table public.chat_customer_summary_state to authenticated;

drop policy if exists chat_customer_summary_state_admin_realtime on public.chat_customer_summary_state;
create policy chat_customer_summary_state_admin_realtime
on public.chat_customer_summary_state
for select
to authenticated
using (v21_private.is_current_admin());

do $$
begin
  if not exists(
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='chat_customer_summary_state'
  ) then
    alter publication supabase_realtime add table public.chat_customer_summary_state;
  end if;
end
$$;
