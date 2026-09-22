begin;

alter table public.chat_customer_care_daily
  add column if not exists recommended_send_at timestamptz null;

create index if not exists chat_customer_care_daily_recommended_send_idx
  on public.chat_customer_care_daily(business_date, recommended_send_at)
  where contacted_at is null;

create or replace function public.chat_customer_care_source_for_date(p_date date)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    -- Milk is delivered Monday and Friday, so remind one day earlier:
    -- Sunday (7) -> Monday delivery, Thursday (4) -> Friday delivery.
    when extract(isodow from p_date)::int in (4,7)
      then jsonb_build_object(
        'source_key','sua',
        'source_label','Sữa',
        'care_reason','pre_delivery',
        'delivery_day',case extract(isodow from p_date)::int
          when 7 then 'Thứ 2'
          else 'Thứ 6'
        end
      )
    else jsonb_build_object(
      'source_key','hang-thuong',
      'source_label','Hàng thường',
      'care_reason','regular'
    )
  end;
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
  v_time time := v_local::time;
  v_source jsonb;
  v_source_key text;
  v_source_label text;
  v_count integer := 0;
begin
  v_source := public.chat_customer_care_source_for_date(v_date);
  v_source_key := v_source->>'source_key';
  v_source_label := v_source->>'source_label';

  -- Keep already-contacted rows as the once-per-day guard.
  delete from public.chat_customer_care_daily d
  where d.business_date=v_date
    and d.contacted_at is null;

  with base as (
    select
      a.id as customer_id,
      a.display_name,
      a.username,
      max(o.delivered_at) filter(where o.status='delivered') as last_order_at
    from public.v21_accounts a
    left join public.taphoa_orders o on o.customer_account_id=a.id
    where a.role='user'
      and a.contact_group='customer'
      and a.deleted_at is null
      and a.locked_at is null
    group by a.id,a.display_name,a.username
  ),
  eligible as (
    select
      b.customer_id,
      b.display_name,
      b.username,
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
    where (
      b.last_order_at is null
      or v_date - (b.last_order_at at time zone 'Asia/Ho_Chi_Minh')::date >= 3
    )
      and not exists (
        select 1
        from public.chat_customer_care_daily d
        where d.business_date=v_date
          and d.customer_id=b.customer_id
          and d.contacted_at is not null
      )
  ),
  ranked as (
    select
      e.*,
      row_number() over (
        order by
          (e.days_since_last_order is null),
          e.days_since_last_order desc nulls last,
          lower(coalesce(e.display_name,e.username,'')),
          e.customer_id
      ) as care_rank
    from eligible e
  ),
  planned as (
    select
      r.*,
      case
        -- Morning scan: split the current group across both windows.
        -- Every customer gets a separate 2-minute slot.
        when v_time < time '12:00' then
          case
            when r.care_rank > 60 then null
            when mod(r.care_rank,2)=1 then
              ((v_date + time '09:32') at time zone 'Asia/Ho_Chi_Minh')
              + (((r.care_rank - 1) / 2)::int * interval '2 minutes')
            else
              ((v_date + time '14:17') at time zone 'Asia/Ho_Chi_Minh')
              + (((r.care_rank - 2) / 2)::int * interval '2 minutes')
          end
        -- Afternoon rescan: only still-open customers are replanned
        -- into the afternoon window, still separated by 2 minutes.
        else
          case
            when r.care_rank > 37 then null
            else
              ((v_date + time '14:17') at time zone 'Asia/Ho_Chi_Minh')
              + ((r.care_rank - 1)::int * interval '2 minutes')
          end
      end as recommended_send_at
    from ranked r
  )
  insert into public.chat_customer_care_daily(
    business_date,customer_id,source_key,source_label,last_order_at,
    days_since_last_order,purchase_state,suggestions,generated_at,recommended_send_at
  )
  select
    v_date,
    p.customer_id,
    v_source_key,
    v_source_label,
    p.last_order_at,
    p.days_since_last_order,
    p.purchase_state,
    public.chat_customer_care_suggestions(p.customer_id,v_source_key),
    p_now,
    p.recommended_send_at
  from planned p
  on conflict(business_date,customer_id) do update set
    source_key=excluded.source_key,
    source_label=excluded.source_label,
    last_order_at=excluded.last_order_at,
    days_since_last_order=excluded.days_since_last_order,
    purchase_state=excluded.purchase_state,
    suggestions=excluded.suggestions,
    generated_at=excluded.generated_at,
    recommended_send_at=case
      when public.chat_customer_care_daily.contacted_at is null
        then excluded.recommended_send_at
      else public.chat_customer_care_daily.recommended_send_at
    end;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok',true,
    'business_date',v_date,
    'source_key',v_source_key,
    'source_label',v_source_label,
    'care_reason',v_source->>'care_reason',
    'delivery_day',v_source->>'delivery_day',
    'candidate_count',v_count,
    'stagger_minutes',2,
    'auto_send',false,
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
      'contacted_at',d.contacted_at,
      'recommended_send_at',d.recommended_send_at,
      'recommended_send_time',case
        when d.recommended_send_at is null then null
        else to_char(d.recommended_send_at at time zone 'Asia/Ho_Chi_Minh','HH24:MI')
      end,
      'send_state',case
        when d.contacted_at is not null then 'contacted'
        when d.recommended_send_at is null then 'deferred'
        when d.recommended_send_at > p_now then 'waiting'
        when v_window_state in ('open_morning','open_afternoon') then 'ready'
        else 'outside_window'
      end
    )
    order by
      (d.contacted_at is not null),
      d.recommended_send_at nulls last,
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
    'care_reason',v_source->>'care_reason',
    'delivery_day',v_source->>'delivery_day',
    'scan_times',jsonb_build_array('09:15','14:00'),
    'send_windows',jsonb_build_array('09:30–10:30','14:15–15:30'),
    'window_state',v_window_state,
    'window_label',v_window_label,
    'stagger_minutes',2,
    'morning_first_slot','09:32',
    'afternoon_first_slot','14:17',
    'max_contact_per_customer_per_day',1,
    'daily_stagger_capacity',60,
    'auto_send',false,
    'send_mode','manual_staggered',
    'customers',v_rows
  );
end;
$$;

revoke all on function public.chat_customer_care_source_for_date(date) from public,anon,authenticated;
revoke all on function public.chat_customer_care_refresh(timestamptz) from public,anon,authenticated;
revoke all on function public.chat_customer_care_feed(timestamptz) from public,anon;

grant execute on function public.chat_customer_care_source_for_date(date) to service_role;
grant execute on function public.chat_customer_care_refresh(timestamptz) to service_role;
grant execute on function public.chat_customer_care_feed(timestamptz) to authenticated;

commit;
