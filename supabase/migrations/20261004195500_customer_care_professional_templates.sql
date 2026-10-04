-- Professional customer-care message templates with guaranteed suggestions.
-- Priority: customer history -> popular products -> active catalog fallback.

create or replace function public.chat_customer_care_suggestions(
  p_customer_id uuid,
  p_source_key text
)
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  with personal as (
    select p.product_code,p.product_name,sum(i.qty)::numeric as total_qty,
           count(distinct o.id)::int as order_count,max(o.delivered_at) as last_bought_at
    from public.taphoa_orders o
    join public.taphoa_order_items i on i.order_id=o.id
    join public.taphoa_products p on p.product_code=i.product_code
    where o.customer_account_id=p_customer_id
      and o.status='delivered'
      and p.source_key=p_source_key
      and p.deleted_at is null
      and coalesce(p.is_active,true)
    group by p.product_code,p.product_name
    order by max(o.delivered_at) desc,count(distinct o.id) desc,sum(i.qty) desc,p.product_name
    limit 5
  ),
  market as (
    select p.product_code,p.product_name,sum(i.qty)::numeric as total_qty,
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
    order by count(distinct o.customer_account_id) desc,sum(i.qty) desc,max(o.delivered_at) desc,p.product_name
    limit 15
  ),
  catalog as (
    select p.product_code,p.product_name,p.updated_at
    from public.taphoa_products p
    where p.source_key=p_source_key
      and p.deleted_at is null
      and coalesce(p.is_active,true)
    order by
      case when lower(coalesce(p.stock_status,'')) in ('out','out_of_stock','sold_out') then 1 else 0 end,
      p.updated_at desc nulls last,p.product_name
    limit 30
  ),
  combined as (
    select 0 as priority,p.product_code,p.product_name,p.last_bought_at as sort_at,
      jsonb_build_object(
        'product_code',p.product_code,'name',p.product_name,'reason','customer_history',
        'qty',p.total_qty,'orders',p.order_count,'last_bought_at',p.last_bought_at
      ) as item
    from personal p
    union all
    select 1,m.product_code,m.product_name,m.last_bought_at,
      jsonb_build_object(
        'product_code',m.product_code,'name',m.product_name,'reason','market',
        'market_qty',m.total_qty,'market_customers',m.customer_count
      )
    from market m
    where not exists(select 1 from personal p where p.product_code=m.product_code)
    union all
    select 2,c.product_code,c.product_name,c.updated_at,
      jsonb_build_object('product_code',c.product_code,'name',c.product_name,'reason','catalog')
    from catalog c
    where not exists(select 1 from personal p where p.product_code=c.product_code)
      and not exists(select 1 from market m where m.product_code=c.product_code)
  ),
  picked as (
    select * from combined
    order by priority,sort_at desc nulls last,product_name
    limit 5
  )
  select coalesce(
    jsonb_agg(item order by priority,sort_at desc nulls last,product_name),
    '[]'::jsonb
  )
  from picked;
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

  v_suggestions := public.chat_customer_care_suggestions(p_customer_id,v_source_key);

  select string_agg(x->>'name',' · ' order by ord)
  into v_names
  from jsonb_array_elements(v_suggestions) with ordinality as e(x,ord);

  v_basis := case
    when exists(
      select 1 from jsonb_array_elements(v_suggestions) x
      where x->>'reason'='customer_history'
    ) then 'history'
    else 'suggested'
  end;

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

  if v_source_key='sua' then
    v_body :=
      'Nhắc đơn Sữa · ' || v_weekday || ', ' || to_char(p_date,'DD/MM')
      || E'\nHôm nay là lịch giao Sữa. Anh/chị vui lòng kiểm tra số lượng Sữa cần bổ sung.'
      || case when coalesce(v_names,'')<>'' then E'\nGợi ý sản phẩm: ' || v_names else '' end
      || case when coalesce(v_link,'')<>'' then E'\nXem hàng và đặt hàng: ' || v_link else '' end;
  else
    v_body :=
      'Nhắc đơn hàng · ' || v_weekday || ', ' || to_char(p_date,'DD/MM')
      || E'\nAnh/chị vui lòng kiểm tra các mặt hàng thông dụng cần bổ sung hôm nay.'
      || case when coalesce(v_names,'')<>'' then E'\nGợi ý sản phẩm: ' || v_names else '' end
      || case when coalesce(v_link,'')<>'' then E'\nXem hàng và đặt hàng: ' || v_link else '' end;
  end if;

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

revoke all on function public.chat_customer_care_message(uuid,date)
from public,anon,authenticated;
grant execute on function public.chat_customer_care_message(uuid,date)
to service_role;

select public.chat_customer_care_refresh(now());
