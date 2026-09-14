begin;

create or replace function public.chat_customer_summary_work_feed()
returns table(
  customer_id uuid,
  username text,
  display_name text,
  last_scanned_at timestamptz,
  result_json jsonb,
  last_error text
)
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.v21_accounts actor
    where actor.auth_user_id = auth.uid()
      and actor.role = 'admin'
      and actor.deleted_at is null
      and actor.locked_at is null
  ) then
    raise exception 'admin_required';
  end if;

  return query
  select
    a.id,
    a.username,
    a.display_name,
    s.last_scanned_at,
    coalesce(s.last_result,'{"items":[],"notes":[],"totalLines":0,"totals":[]}'::jsonb),
    s.last_error
  from public.chat_customer_summary_state s
  join public.v21_accounts a on a.id = s.customer_id
  where a.contact_group = 'customer'
    and a.deleted_at is null
    and s.last_scanned_at is not null
  order by s.last_scanned_at desc nulls last, lower(coalesce(a.display_name,a.username,'')), a.id;
end;
$$;

revoke all on function public.chat_customer_summary_work_feed() from public,anon;
grant execute on function public.chat_customer_summary_work_feed() to authenticated;

commit;
