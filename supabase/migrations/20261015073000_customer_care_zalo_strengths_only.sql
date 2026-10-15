-- Customer-care update 2026-10-15: Zalo-linked KH only, strengths + 2-day sales.
-- One existing cron owner; no cron/worker changes and no immediate sends.
-- Fixed marketed goods are non-tobacco; never advertise tobacco.
-- Given KH not Zalo-linked => never plan/send; Given linked KH => 07–08 window.
-- Given duplicate recent SKU => one item per code; named hero aliases not repeated.
-- Given no fresh orders => existing sender skips. Follow marketing consent/opt-out.
begin;

create or replace function public.chat_customer_care_recent_sales(p_date date)
returns jsonb language sql stable security definer
set search_path = public,pg_temp
as $recent$
  select coalesce(jsonb_agg(
    jsonb_build_object('product_code',x.product_code,'name',x.product_name)
    order by lower(x.product_name),x.product_code
  ),'[]'::jsonb)
  from (
    select i.product_code,
      coalesce(max(nullif(p.product_name,'')),i.product_code) as product_name
    from public.taphoa_orders o
    join public.taphoa_order_items i on i.order_id=o.id
    left join public.taphoa_products p on p.product_code=i.product_code
    where o.status='delivered'
      and coalesce(p.source_key,'') <> 'thuoc-la'
      and o.delivered_at >= ((p_date-1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and o.delivered_at < ((p_date+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
    group by i.product_code
  ) x;
$recent$;

revoke all on function public.chat_customer_care_recent_sales(date) from public,anon,authenticated;
grant execute on function public.chat_customer_care_recent_sales(date) to postgres,service_role;

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
      and exists (
        select 1 from public.zalo_user_links zl where zl.chat_account_id=a.id
      )
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
    where not exists (
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
          coalesce((
            select max(past.contacted_at) from public.chat_customer_care_daily past
            where past.customer_id=e.customer_id
          ),'1970-01-01'::timestamptz),
          lower(coalesce(e.display_name,e.username,'')),e.customer_id
      ) as care_rank
    from eligible e
  ),
  planned as (
    select r.*,
      case when r.care_rank <= 60 then
        ((v_date+time '07:00') at time zone 'Asia/Ho_Chi_Minh')
          + ((r.care_rank-1)::int * interval '1 minute')
      else null end as recommended_send_at
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
    'stagger_minutes',1,
    'auto_send',true,
    'send_mode','auto_safe_staggered',
    'generated_at',p_now
  );
end;
$function$;


create or replace function public.chat_customer_care_message(
  p_customer_id uuid,
  p_date date default ((now() at time zone 'Asia/Ho_Chi_Minh')::date)
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_source jsonb := public.chat_customer_care_source_for_date(p_date);
  v_source_key text := v_source->>'source_key';
  v_suggestions jsonb;
  v_names text;
  v_weekday text;
  v_link text;
  v_body text;
  v_basis text;
begin
  if p_customer_id is null then raise exception 'customer_required'; end if;

  v_suggestions := public.chat_customer_care_recent_sales(p_date);

  -- Exact named hero products are advertised once in the fixed section.
  -- Other two-day products retain their names and pack sizes, deduped by code.
  with extra as (
    select x, row_number() over(order by ord) as idx
    from jsonb_array_elements(v_suggestions) with ordinality as e(x,ord)
    where lower(x->>'name') !~ '(ensua|en sua|keo mai|kẹo mai|(^|[^a-z0-9])3v([^a-z0-9]|$))'
  )
  select string_agg(
    (case when mod((idx-1)::int,4)=0 then E'\n• ' else '; ' end)
    || (x->>'name'),'' order by idx
  ) into v_names
  from extra;

  v_basis := 'strengths_plus_recent_sales_2d';

  v_weekday := case extract(isodow from p_date)::int
    when 1 then 'Thứ Hai'
    when 2 then 'Thứ Ba'
    when 3 then 'Thứ Tư'
    when 4 then 'Thứ Năm'
    when 5 then 'Thứ Sáu'
    when 6 then 'Thứ Bảy'
    else 'Chủ nhật'
  end;

  v_link := public.taphoa_customer_mini_link(p_customer_id,'hang',null,null,null);

  v_body :=
    'Giới thiệu mặt hàng & nhắc bổ sung – ' || to_char(p_date,'DD/MM')
    || E'\nAnh/chị xem cửa hàng mình có cần bổ sung hàng không nhé. Em gửi các nhóm hàng bên em đang cung cấp để anh/chị tiện tham khảo ạ.'
    || E'\n\nMẶT HÀNG THẾ MẠNH:'
    || E'\n• Sữa các loại: sữa bột, sữa nước, sữa 9 hạt; sữa Ensua (loại đắt/rẻ).'
    || E'\n• Bánh kẹo: kẹo Mai, 3V; bánh quy, bánh hộp và nhiều quy cách.'
    || E'\n• Hàng thiết yếu: đường trắng/vàng, mì chính, dầu ăn chai/can; cà phê, gia vị.'
    || E'\n• Hàng U: dầu gội, sữa tắm, giặt xả, vệ sinh nhà bếp/nhà cửa.'
    || E'\n• Hàng nguyên thùng/kiện và sản phẩm giá trị lớn: báo giá theo quy cách, số lượng.'
    || case when coalesce(v_names,'')<>'' then
        E'\n\nCÁC SẢN PHẨM VỪA BÁN ' || to_char(p_date-1,'DD/MM') || '–' || to_char(p_date,'DD/MM') || ':'
        || v_names
      else '' end
    || E'\n\nAnh/chị cần mặt hàng nào cứ nhắn tên và số lượng, em kiểm tra giá và sắp xếp giao phù hợp ạ.'
    || case when coalesce(v_link,'')<>'' then E'\nXem hàng và đặt hàng: ' || v_link else '' end
    || E'\n(Nếu anh/chị không muốn nhận tin giới thiệu hàng, cứ nhắn em nhé.)';

  return jsonb_build_object(
    'customer_id',p_customer_id,
    'business_date',p_date,
    'source_key',v_source_key,
    'source_label',v_source->>'source_label',
    'suggestion_basis',v_basis,
    'suggestions',v_suggestions,
    'body',v_body,
    'link',v_link
  );
end;
$function$;


revoke all on function public.chat_customer_care_message(uuid,date) from public,anon,authenticated;
grant execute on function public.chat_customer_care_message(uuid,date) to service_role;

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

  if not (v_time >= time '07:00' and v_time < time '08:00') then
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
      and z.updated_at > now()-interval '60 seconds'
  ) then
    return jsonb_build_object('ok',true,'sent',false,'reason','zalo_recent_outbound');
  end if;

  if exists (
    select 1 from public.v21_messages m
    where m.client_id like 'care:auto:%'
      and m.created_at > now()-interval '60 seconds'
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
    and exists (
      select 1 from public.zalo_user_links zl
      where zl.chat_account_id=d.customer_id
    )
  order by d.recommended_send_at,d.customer_id
  for update of d skip locked
  limit 1;

  if not found then
    return jsonb_build_object('ok',true,'sent',false,'reason','no_due_customer');
  end if;

  v_msg := public.chat_customer_care_message(v_row.customer_id,v_date);
  if coalesce(jsonb_array_length(v_msg->'suggestions'),0)=0 then
    return jsonb_build_object('ok',true,'sent',false,'reason','no_recent_sales');
  end if;

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


revoke all on function public.chat_customer_care_send_due(timestamptz) from public,anon,authenticated;
grant execute on function public.chat_customer_care_send_due(timestamptz) to postgres,service_role;
commit;
