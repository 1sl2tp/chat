-- Auto-send customer-care only to KH (contact_group=customer) with
-- conservative pacing for Chat/Zalo:
-- - one candidate per cron pass;
-- - cron every 5 minutes in business-hour bands;
-- - no send when the Zalo outbound queue is busy;
-- - leave 2 minutes around any other successful Zalo outbound;
-- - skip a customer with conversation activity in the last 60 minutes;
-- - once per customer/day through contacted_at + idempotent client_id.

create or replace function public.chat_customer_care_refresh(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
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
      b.customer_id,b.display_name,b.username,b.last_order_at,
      case
        when b.last_order_at is null then null
        else greatest(0,v_date-(b.last_order_at at time zone 'Asia/Ho_Chi_Minh')::date)
      end as days_since_last_order,
      case when b.last_order_at is null then 'never_purchased' else 'stale' end as purchase_state
    from base b
    where (
      b.last_order_at is null
      or v_date-(b.last_order_at at time zone 'Asia/Ho_Chi_Minh')::date >= 3
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
        when v_time < time '12:00' then
          case
            when r.care_rank <= 24 then
              ((v_date + time '09:35') at time zone 'Asia/Ho_Chi_Minh')
              + ((r.care_rank-1)::int * interval '5 minutes')
            when r.care_rank <= 60 then
              ((v_date + time '14:20') at time zone 'Asia/Ho_Chi_Minh')
              + ((r.care_rank-25)::int * interval '5 minutes')
            else null
          end
        else
          case
            when r.care_rank <= 40 then
              ((v_date + time '14:20') at time zone 'Asia/Ho_Chi_Minh')
              + ((r.care_rank-1)::int * interval '5 minutes')
            else null
          end
      end as recommended_send_at
    from ranked r
  )
  insert into public.chat_customer_care_daily(
    business_date,customer_id,source_key,source_label,last_order_at,
    days_since_last_order,purchase_state,suggestions,generated_at,recommended_send_at
  )
  select
    v_date,p.customer_id,v_source_key,v_source_label,p.last_order_at,
    p.days_since_last_order,p.purchase_state,
    public.chat_customer_care_suggestions(p.customer_id,v_source_key),
    p_now,p.recommended_send_at
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

  get diagnostics v_count=row_count;

  return jsonb_build_object(
    'ok',true,
    'business_date',v_date,
    'source_key',v_source_key,
    'source_label',v_source_label,
    'care_reason',v_source->>'care_reason',
    'delivery_day',v_source->>'delivery_day',
    'candidate_count',v_count,
    'stagger_minutes',5,
    'auto_send',true,
    'send_mode','auto_safe_staggered',
    'generated_at',p_now
  );
end;
$function$;

create or replace function public.chat_customer_care_feed(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public,auth,pg_temp
as $function$
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
    select 1 from public.v21_accounts actor
    where actor.auth_user_id=auth.uid()
      and actor.role='admin'
      and actor.deleted_at is null
      and actor.locked_at is null
  ) then
    raise exception 'admin_required';
  end if;

  if v_time < time '09:30' then
    v_window_state := 'before_morning';
    v_window_label := '09:30–11:35';
  elsif v_time <= time '11:35' then
    v_window_state := 'open_morning';
    v_window_label := '09:30–11:35';
  elsif v_time < time '14:15' then
    v_window_state := 'between_windows';
    v_window_label := '14:15–17:35';
  elsif v_time <= time '17:35' then
    v_window_state := 'open_afternoon';
    v_window_label := '14:15–17:35';
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
    and d.source_key=(v_source->>'source_key')
    and a.role='user'
    and a.contact_group='customer'
    and a.deleted_at is null
    and a.locked_at is null;

  return jsonb_build_object(
    'business_date',v_date,
    'source_key',v_source->>'source_key',
    'source_label',v_source->>'source_label',
    'care_reason',v_source->>'care_reason',
    'delivery_day',v_source->>'delivery_day',
    'scan_times',jsonb_build_array('09:15','14:00'),
    'send_windows',jsonb_build_array('09:30–11:35','14:15–17:35'),
    'window_state',v_window_state,
    'window_label',v_window_label,
    'stagger_minutes',5,
    'morning_first_slot','09:35',
    'afternoon_first_slot','14:20',
    'max_contact_per_customer_per_day',1,
    'daily_stagger_capacity',60,
    'auto_send',true,
    'send_mode','auto_safe_staggered',
    'customers',v_rows
  );
end;
$function$;

create or replace function public.chat_customer_care_send_due(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public,v21_private,pg_temp
as $function$
declare
  v_local timestamp := coalesce(p_now,now()) at time zone 'Asia/Ho_Chi_Minh';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_admin uuid;
  v_row public.chat_customer_care_daily;
  v_msg jsonb;
  v_message_id uuid;
  v_lock boolean;
begin
  v_lock := pg_try_advisory_xact_lock(hashtextextended('chat_customer_care_send_due',0));
  if not v_lock then
    return jsonb_build_object('ok',true,'sent',false,'reason','busy');
  end if;

  if not (
    (v_time >= time '09:30' and v_time <= time '11:35')
    or
    (v_time >= time '14:15' and v_time <= time '17:35')
  ) then
    return jsonb_build_object('ok',true,'sent',false,'reason','outside_window');
  end if;

  if exists (
    select 1 from public.zalo_message_links z
    where z.direction='outbound'
      and z.state in ('pending','sending','retry','retrying')
  ) then
    return jsonb_build_object('ok',true,'sent',false,'reason','zalo_queue_busy');
  end if;

  if exists (
    select 1 from public.zalo_message_links z
    where z.direction='outbound'
      and z.state='sent'
      and z.updated_at > now()-interval '2 minutes'
  ) then
    return jsonb_build_object('ok',true,'sent',false,'reason','zalo_recent_outbound');
  end if;

  if exists (
    select 1 from public.v21_messages m
    where m.client_id like 'care:auto:%'
      and m.created_at > now()-interval '4 minutes 30 seconds'
      and m.deleted_at is null
  ) then
    return jsonb_build_object('ok',true,'sent',false,'reason','paced');
  end if;

  select a.id into v_admin
  from public.v21_accounts a
  where a.role='admin'
    and a.deleted_at is null
    and a.locked_at is null
  order by a.created_at,a.id
  limit 1;

  if v_admin is null then
    return jsonb_build_object('ok',false,'sent',false,'reason','admin_not_found');
  end if;

  select d.*
  into v_row
  from public.chat_customer_care_daily d
  join public.v21_accounts a on a.id=d.customer_id
  where d.business_date=v_date
    and d.contacted_at is null
    and d.recommended_send_at is not null
    and d.recommended_send_at <= p_now
    and a.role='user'
    and a.contact_group='customer'
    and a.deleted_at is null
    and a.locked_at is null
    and not exists (
      select 1
      from public.v21_conversations c
      join public.v21_messages m on m.conversation_id=c.id
      where m.deleted_at is null
        and m.created_at > now()-interval '60 minutes'
        and (
          (c.member_a=v_admin and c.member_b=d.customer_id)
          or
          (c.member_a=d.customer_id and c.member_b=v_admin)
        )
    )
  order by d.recommended_send_at,d.customer_id
  for update of d skip locked
  limit 1;

  if not found then
    return jsonb_build_object('ok',true,'sent',false,'reason','no_due_customer');
  end if;

  v_msg := public.chat_customer_care_message(v_row.customer_id,v_date);
  v_message_id := public.taphoa_chat_notify_customer(
    v_row.customer_id,
    v_admin,
    'care:auto:'||to_char(v_date,'YYYYMMDD')||':'||v_row.customer_id::text,
    v_msg->>'body'
  );

  if v_message_id is null then
    return jsonb_build_object(
      'ok',false,'sent',false,'reason','message_not_created',
      'customer_id',v_row.customer_id
    );
  end if;

  update public.chat_customer_care_daily
  set contacted_at=coalesce(contacted_at,now()),
      contacted_by_account_id=coalesce(contacted_by_account_id,v_admin)
  where business_date=v_date
    and customer_id=v_row.customer_id
    and contacted_at is null;

  return jsonb_build_object(
    'ok',true,'sent',true,
    'customer_id',v_row.customer_id,
    'message_id',v_message_id,
    'source_key',v_row.source_key,
    'recommended_send_at',v_row.recommended_send_at
  );
end;
$function$;

revoke all on function public.chat_customer_care_send_due(timestamptz)
from public,anon,authenticated;
grant execute on function public.chat_customer_care_send_due(timestamptz)
to postgres,service_role;

do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname='chat-customer-care-auto-send'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'chat-customer-care-auto-send',
  '*/5 2-4,7-10 * * *',
  'select public.chat_customer_care_send_due();'
);

select public.chat_customer_care_refresh(now());
