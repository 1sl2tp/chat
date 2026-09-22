begin;

create table if not exists public.chat_customer_care_daily (
  business_date date not null,
  customer_id uuid not null references public.v21_accounts(id) on delete cascade,
  source_key text not null check (source_key in ('sua','hang-thuong')),
  source_label text not null,
  last_order_at timestamptz null,
  days_since_last_order integer null check (days_since_last_order is null or days_since_last_order >= 0),
  purchase_state text not null check (purchase_state in ('stale','never_purchased')),
  suggestions jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  contacted_at timestamptz null,
  contacted_by_account_id uuid null references public.v21_accounts(id) on delete set null,
  primary key (business_date, customer_id)
);

create index if not exists chat_customer_care_daily_open_idx
  on public.chat_customer_care_daily(business_date, contacted_at, days_since_last_order desc);

alter table public.chat_customer_care_daily enable row level security;
revoke all on public.chat_customer_care_daily from public,anon,authenticated;
grant select,insert,update,delete on public.chat_customer_care_daily to service_role;

create or replace function public.chat_customer_care_source_for_date(p_date date)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when extract(isodow from p_date)::int in (1,5)
      then jsonb_build_object('source_key','sua','source_label','Sữa')
    else jsonb_build_object('source_key','hang-thuong','source_label','Hàng thường')
  end;
$$;

create or replace function public.chat_customer_care_suggestions(
  p_customer_id uuid,
  p_source_key text
)
returns jsonb
language sql
stable
security definer
set search_path = public,pg_temp
as $$
  with personal as (
    select
      p.product_code,
      p.product_name,
      sum(i.qty)::numeric as total_qty,
      count(distinct o.id)::int as order_count,
      max(o.delivered_at) as last_bought_at
    from public.taphoa_orders o
    join public.taphoa_order_items i on i.order_id=o.id
    join public.taphoa_products p on p.product_code=i.product_code
    where o.customer_account_id=p_customer_id
      and o.status='delivered'
      and p.source_key=p_source_key
      and p.deleted_at is null
      and coalesce(p.is_active,true)
    group by p.product_code,p.product_name
    order by max(o.delivered_at) desc, count(distinct o.id) desc, sum(i.qty) desc, p.product_name
    limit 3
  ),
  market as (
    select
      p.product_code,
      p.product_name,
      sum(i.qty)::numeric as total_qty,
      count(distinct o.customer_account_id)::int as customer_count,
      max(o.delivered_at) as last_bought_at
    from public.taphoa_orders o
    join public.taphoa_order_items i on i.order_id=o.id
    join public.taphoa_products p on p.product_code=i.product_code
    where o.status='delivered'
      and p.source_key=p_source_key
      and p.deleted_at is null
      and coalesce(p.is_active,true)
    group by p.product_code,p.product_name
    order by count(distinct o.customer_account_id) desc, sum(i.qty) desc, max(o.delivered_at) desc, p.product_name
    limit 8
  ),
  combined as (
    select
      0 as priority,
      p.product_code,
      p.product_name,
      p.last_bought_at,
      jsonb_build_object(
        'product_code',p.product_code,
        'name',p.product_name,
        'reason','customer_history',
        'qty',p.total_qty,
        'orders',p.order_count,
        'last_bought_at',p.last_bought_at
      ) as item
    from personal p
    union all
    select
      1 as priority,
      m.product_code,
      m.product_name,
      m.last_bought_at,
      jsonb_build_object(
        'product_code',m.product_code,
        'name',m.product_name,
        'reason','market',
        'market_qty',m.total_qty,
        'market_customers',m.customer_count
      ) as item
    from market m
    where not exists(select 1 from personal p where p.product_code=m.product_code)
  ),
  picked as (
    select *
    from combined
    order by priority,last_bought_at desc nulls last,product_name
    limit 3
  )
  select coalesce(jsonb_agg(item order by priority,last_bought_at desc nulls last,product_name),'[]'::jsonb)
  from picked;
$$;

create or replace function public.chat_customer_care_refresh(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp
as $$
declare
  v_local timestamp := coalesce(p_now,now()) at time zone 'Asia/Ho_Chi_Minh';
  v_date date := v_local::date;
  v_source jsonb;
  v_source_key text;
  v_source_label text;
  v_count integer := 0;
begin
  v_source := public.chat_customer_care_source_for_date(v_date);
  v_source_key := v_source->>'source_key';
  v_source_label := v_source->>'source_label';

  delete from public.chat_customer_care_daily d
  where d.business_date=v_date
    and d.contacted_at is null;

  with base as (
    select
      a.id as customer_id,
      max(o.delivered_at) filter(where o.status='delivered') as last_order_at
    from public.v21_accounts a
    left join public.taphoa_orders o on o.customer_account_id=a.id
    where a.role='user'
      and a.contact_group='customer'
      and a.deleted_at is null
      and a.locked_at is null
    group by a.id
  ),
  eligible as (
    select
      b.customer_id,
      b.last_order_at,
      case
        when b.last_order_at is null then null
        else greatest(
          0,
          v_date - (b.last_order_at at time zone 'Asia/Ho_Chi_Minh')::date
        )
      end as days_since_last_order,
      case when b.last_order_at is null then 'never_purchased' else 'stale' end as purchase_state
    from base b
    where b.last_order_at is null
       or v_date - (b.last_order_at at time zone 'Asia/Ho_Chi_Minh')::date >= 3
  )
  insert into public.chat_customer_care_daily(
    business_date,customer_id,source_key,source_label,last_order_at,
    days_since_last_order,purchase_state,suggestions,generated_at
  )
  select
    v_date,
    e.customer_id,
    v_source_key,
    v_source_label,
    e.last_order_at,
    e.days_since_last_order,
    e.purchase_state,
    public.chat_customer_care_suggestions(e.customer_id,v_source_key),
    p_now
  from eligible e
  on conflict(business_date,customer_id) do update set
    source_key=excluded.source_key,
    source_label=excluded.source_label,
    last_order_at=excluded.last_order_at,
    days_since_last_order=excluded.days_since_last_order,
    purchase_state=excluded.purchase_state,
    suggestions=excluded.suggestions,
    generated_at=excluded.generated_at;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok',true,
    'business_date',v_date,
    'source_key',v_source_key,
    'source_label',v_source_label,
    'candidate_count',v_count,
    'generated_at',p_now
  );
end;
$$;

create or replace function public.chat_customer_care_feed(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $$
declare
  v_local timestamp := coalesce(p_now,now()) at time zone 'Asia/Ho_Chi_Minh';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_source jsonb := public.chat_customer_care_source_for_date(v_date);
  v_window_state text;
  v_window_label text;
  v_rows jsonb;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.v21_accounts actor
    where actor.auth_user_id=auth.uid()
      and actor.role='admin'
      and actor.deleted_at is null
      and actor.locked_at is null
  ) then
    raise exception 'admin_required';
  end if;

  if v_time < time '09:30' then
    v_window_state := 'before_morning';
    v_window_label := '09:30–10:30';
  elsif v_time <= time '10:30' then
    v_window_state := 'open_morning';
    v_window_label := '09:30–10:30';
  elsif v_time < time '14:15' then
    v_window_state := 'between_windows';
    v_window_label := '14:15–15:30';
  elsif v_time <= time '15:30' then
    v_window_state := 'open_afternoon';
    v_window_label := '14:15–15:30';
  else
    v_window_state := 'closed';
    v_window_label := 'Ngày mai';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'customer_id',d.customer_id,
      'username',a.username,
      'display_name',a.display_name,
      'last_order_at',d.last_order_at,
      'days_since_last_order',d.days_since_last_order,
      'purchase_state',d.purchase_state,
      'suggestions',d.suggestions,
      'generated_at',d.generated_at,
      'contacted_at',d.contacted_at
    )
    order by
      (d.contacted_at is not null),
      (d.days_since_last_order is null),
      d.days_since_last_order desc nulls last,
      lower(coalesce(a.display_name,a.username,'')),
      d.customer_id
  ),'[]'::jsonb)
  into v_rows
  from public.chat_customer_care_daily d
  join public.v21_accounts a on a.id=d.customer_id
  where d.business_date=v_date
    and d.source_key=(v_source->>'source_key');

  return jsonb_build_object(
    'business_date',v_date,
    'source_key',v_source->>'source_key',
    'source_label',v_source->>'source_label',
    'scan_times',jsonb_build_array('09:15','14:00'),
    'send_windows',jsonb_build_array('09:30–10:30','14:15–15:30'),
    'window_state',v_window_state,
    'window_label',v_window_label,
    'max_contact_per_customer_per_day',1,
    'auto_send',false,
    'customers',v_rows
  );
end;
$$;

create or replace function public.chat_customer_care_mark_contacted(
  p_customer_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $$
declare
  v_actor uuid;
  v_date date := (coalesce(p_now,now()) at time zone 'Asia/Ho_Chi_Minh')::date;
  v_row public.chat_customer_care_daily;
begin
  select actor.id
  into v_actor
  from public.v21_accounts actor
  where actor.auth_user_id=auth.uid()
    and actor.role='admin'
    and actor.deleted_at is null
    and actor.locked_at is null
  limit 1;

  if v_actor is null then raise exception 'admin_required'; end if;

  update public.chat_customer_care_daily d
  set contacted_at=coalesce(d.contacted_at,p_now),
      contacted_by_account_id=coalesce(d.contacted_by_account_id,v_actor)
  where d.business_date=v_date
    and d.customer_id=p_customer_id
  returning * into v_row;

  if not found then raise exception 'care_candidate_not_found'; end if;

  return jsonb_build_object(
    'ok',true,
    'customer_id',v_row.customer_id,
    'business_date',v_row.business_date,
    'contacted_at',v_row.contacted_at
  );
end;
$$;

revoke all on function public.chat_customer_care_source_for_date(date) from public,anon,authenticated;
revoke all on function public.chat_customer_care_suggestions(uuid,text) from public,anon,authenticated;
revoke all on function public.chat_customer_care_refresh(timestamptz) from public,anon,authenticated;
revoke all on function public.chat_customer_care_feed(timestamptz) from public,anon;
revoke all on function public.chat_customer_care_mark_contacted(uuid,timestamptz) from public,anon;

grant execute on function public.chat_customer_care_refresh(timestamptz) to service_role;
grant execute on function public.chat_customer_care_suggestions(uuid,text) to service_role;
grant execute on function public.chat_customer_care_source_for_date(date) to service_role;
grant execute on function public.chat_customer_care_feed(timestamptz) to authenticated;
grant execute on function public.chat_customer_care_mark_contacted(uuid,timestamptz) to authenticated;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job
    where jobname in ('chat-customer-care-morning','chat-customer-care-afternoon')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

-- Supabase cron runs in UTC. Vietnam is UTC+7 year-round:
-- 02:15 UTC = 09:15 Asia/Ho_Chi_Minh
-- 07:00 UTC = 14:00 Asia/Ho_Chi_Minh
select cron.schedule(
  'chat-customer-care-morning',
  '15 2 * * *',
  'select public.chat_customer_care_refresh();'
);
select cron.schedule(
  'chat-customer-care-afternoon',
  '0 7 * * *',
  'select public.chat_customer_care_refresh();'
);

commit;
