begin;

create table if not exists public.chat_customer_summary_completion (
  actor_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  customer_id uuid not null references public.v21_accounts(id) on delete cascade,
  item_key text not null,
  completed_at timestamptz not null default now(),
  primary key (actor_account_id, customer_id, item_key)
);

alter table public.chat_customer_summary_completion enable row level security;
revoke all on table public.chat_customer_summary_completion from public, anon, authenticated;

create index if not exists chat_customer_summary_completion_customer_idx
  on public.chat_customer_summary_completion(customer_id, completed_at);

drop function if exists public.chat_customer_summary_work_feed();

create function public.chat_customer_summary_work_feed()
returns table(
  customer_id uuid,
  username text,
  display_name text,
  last_scanned_at timestamptz,
  result_json jsonb,
  last_error text,
  completed_item_keys text[]
)
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $$
declare
  v_actor_id uuid;
begin
  select actor.id
    into v_actor_id
  from public.v21_accounts actor
  where actor.auth_user_id = auth.uid()
    and actor.role = 'admin'
    and actor.deleted_at is null
    and actor.locked_at is null
  limit 1;

  if v_actor_id is null then
    raise exception 'admin_required';
  end if;

  return query
  select
    a.id,
    a.username,
    a.display_name,
    s.last_scanned_at,
    coalesce(s.last_result,'{"items":[],"notes":[],"totalLines":0,"totals":[]}'::jsonb),
    s.last_error,
    coalesce((
      select array_agg(c.item_key order by c.completed_at, c.item_key)
      from public.chat_customer_summary_completion c
      where c.actor_account_id = v_actor_id
        and c.customer_id = a.id
    ), array[]::text[])
  from public.chat_customer_summary_state s
  join public.v21_accounts a on a.id = s.customer_id
  where a.contact_group = 'customer'
    and a.deleted_at is null
    and s.last_scanned_at is not null
  order by s.last_scanned_at desc nulls last, lower(coalesce(a.display_name,a.username,'')), a.id;
end;
$$;

revoke all on function public.chat_customer_summary_work_feed() from public, anon;
grant execute on function public.chat_customer_summary_work_feed() to authenticated;

create or replace function public.chat_customer_summary_set_completed(
  p_customer_id uuid,
  p_item_key text,
  p_completed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $$
declare
  v_actor_id uuid;
  v_item_key text := btrim(coalesce(p_item_key,''));
begin
  select actor.id
    into v_actor_id
  from public.v21_accounts actor
  where actor.auth_user_id = auth.uid()
    and actor.role = 'admin'
    and actor.deleted_at is null
    and actor.locked_at is null
  limit 1;

  if v_actor_id is null then
    raise exception 'admin_required';
  end if;
  if p_customer_id is null or v_item_key = '' then
    raise exception 'invalid_completion_target';
  end if;
  if not exists (
    select 1 from public.v21_accounts customer
    where customer.id = p_customer_id
      and customer.contact_group = 'customer'
      and customer.deleted_at is null
  ) then
    raise exception 'customer_not_found';
  end if;

  if coalesce(p_completed,false) then
    insert into public.chat_customer_summary_completion(actor_account_id,customer_id,item_key,completed_at)
    values(v_actor_id,p_customer_id,v_item_key,now())
    on conflict(actor_account_id,customer_id,item_key)
    do update set completed_at = excluded.completed_at;
  else
    delete from public.chat_customer_summary_completion
    where actor_account_id = v_actor_id
      and customer_id = p_customer_id
      and item_key = v_item_key;
  end if;

  return true;
end;
$$;

revoke all on function public.chat_customer_summary_set_completed(uuid,text,boolean) from public, anon;
grant execute on function public.chat_customer_summary_set_completed(uuid,text,boolean) to authenticated;

commit;
