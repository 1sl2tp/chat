-- Applied to shared Supabase via migration chat_debt_share_fifo_breakdown_20261010 (20261010061148).
-- Private evaluation never appears in outbound message; one existing on-click Chat send RPC.
CREATE OR REPLACE FUNCTION public.v21_admin_send_debt_summary(p_customer_id uuid, p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
declare
  v_actor uuid := v21_private.current_active_account_id();
  v_client_id text := left(btrim(coalesce(p_client_id,'')),100);
  v_payload jsonb;
  v_message_id uuid;
  v_state text;
  v_body text;
  v_date text := to_char(now() at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY');
  v_charges numeric := 0;
  v_collected numeric := 0;
  v_adjustments numeric := 0;
  v_balance numeric := 0;
  v_lines text := '';
  v_open_count integer := 0;
  v_oldest timestamptz;
  v_oldest_days integer := 0;
  v_latest_collected_at timestamptz;
  v_latest_collected numeric := 0;
  v_sale_count integer := 0;
  v_collection_count integer := 0;
  v_purchase_days integer := 0;
  v_paid_pct integer := 0;
  v_purchase_segment text;
  v_payment_segment text;
begin
  if v_actor is null or not exists(
    select 1 from public.v21_accounts a
    where a.id=v_actor and a.role='admin' and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'admin_required' using errcode='42501'; end if;
  if v_client_id='' then raise exception 'client_id_required'; end if;
  v_payload := v21_private.debt_share_summary_payload(p_customer_id,now());
  v_state := v_payload->>'state';
  v_balance := coalesce((v_payload->>'balance')::numeric,0);
  v_body := v_payload->>'body';
  select
    coalesce(sum(l.amount_vnd) filter(where l.amount_vnd>0),0),
    coalesce(-sum(l.amount_vnd) filter(where l.entry_type='collection'),0),
    coalesce(-sum(l.amount_vnd) filter(where l.amount_vnd<0 and l.entry_type<>'collection'),0),
    count(*) filter(where l.entry_type='sale'),
    count(*) filter(where l.entry_type='collection')
  into v_charges,v_collected,v_adjustments,v_sale_count,v_collection_count
  from public.taphoa_debt_ledger l
  where l.customer_account_id=p_customer_id;
  select l.created_at,-l.amount_vnd into v_latest_collected_at,v_latest_collected
  from public.taphoa_debt_ledger l
  where l.customer_account_id=p_customer_id and l.entry_type='collection'
  order by l.created_at desc,l.id desc limit 1;
  select count(distinct (o.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date)
  into v_purchase_days
  from public.taphoa_orders o
  where o.customer_account_id=p_customer_id and o.status='delivered' and o.delivered_at is not null;
  if v_state='debt' and v_balance>0 then
    with charges as (
      select l.id,l.created_at,l.order_id,l.entry_type,l.amount_vnd,
        sum(l.amount_vnd) over(order by l.created_at,l.id rows unbounded preceding) cumulative_positive
      from public.taphoa_debt_ledger l
      where l.customer_account_id=p_customer_id and l.amount_vnd>0
    ), outstanding as (
      select c.id,c.created_at,c.order_id,c.entry_type,
        greatest(0,least(c.amount_vnd,c.cumulative_positive-v_collected-v_adjustments)) remaining
      from charges c
    ), active as (
      select o.id,o.created_at,o.remaining,
        case when o.entry_type='payment' then 'Ghi nợ bổ sung'
             when s.id is not null then coalesce(s.display_prefix,'')||s.display_no::text
             else 'Phát sinh công nợ' end as source_name,
        row_number() over(order by o.created_at,o.id) as ordinal
      from outstanding o
      left join public.taphoa_orders s on s.id=o.order_id
      where o.remaining>0
    )
    select min(a.created_at),count(*)::integer,
      coalesce(string_agg(
        E'\n- '||to_char(a.created_at at time zone 'Asia/Ho_Chi_Minh','DD/MM')
          ||' '||a.source_name||': '||public.taphoa_chat_money(a.remaining),
        '' order by a.created_at,a.id
      ) filter(where a.ordinal<=5),'')
    into v_oldest,v_open_count,v_lines
    from active a;
    if v_oldest is not null then
      v_oldest_days := greatest(0,(now() at time zone 'Asia/Ho_Chi_Minh')::date-(v_oldest at time zone 'Asia/Ho_Chi_Minh')::date);
    end if;
    v_body := 'Đối chiếu công nợ · '||v_date
      ||E'\nTổng đã phát sinh: '||public.taphoa_chat_money(v_charges)
      ||E'\nĐã thu: '||public.taphoa_chat_money(v_collected)
      ||case when v_adjustments<>0 then E'\nĐiều chỉnh giảm: '||public.taphoa_chat_money(v_adjustments) else '' end
      ||E'\nCông nợ còn lại: '||public.taphoa_chat_money(v_balance)||'.'
      ||case when v_latest_collected_at is not null then
          E'\nLần thu gần nhất: '
          ||to_char(v_latest_collected_at at time zone 'Asia/Ho_Chi_Minh','DD/MM')
          ||' · '||public.taphoa_chat_money(v_latest_collected)||'.'
        else '' end
      ||case when v_oldest is not null then
          E'\nKhoản còn lại cũ nhất: '
          ||to_char(v_oldest at time zone 'Asia/Ho_Chi_Minh','DD/MM')
          ||' ('||v_oldest_days||' ngày).'
        else '' end
      ||case when v_open_count>0 then
          E'\nPhân bổ tạm (trừ khoản cũ trước):'||v_lines
          ||case when v_open_count>5 then
             E'\n… và '||(v_open_count-5)||' khoản khác trong chi tiết.' else '' end
        else '' end
      ||E'\nĐây là cách đối chiếu tạm theo thời gian phát sinh; nếu anh/chị đã thanh toán riêng cho đơn nào hoặc thấy chưa khớp, nhắn em để kiểm tra lại.'
      ||case when coalesce(v_payload->>'url','')<>'' then
          E'\nXem chi tiết công nợ: '||(v_payload->>'url') else '' end;
  end if;
  v_paid_pct := case when v_charges>0 then
      least(100,greatest(0,round(v_collected*100/v_charges)::int)) else 0 end;
  v_purchase_segment := case
    when v_sale_count>=4 and v_purchase_days>=3 then 'Khách mua đều · tiềm năng'
    when v_sale_count>=2 then 'Có lịch sử mua hàng'
    else 'Chưa đủ lịch sử mua hàng' end;
  v_payment_segment := case
    when v_balance<=0 then 'Đã tất toán hoặc trả dư'
    when v_oldest_days>=14 and v_paid_pct<50 then 'Nợ tồn lâu · cần đối chiếu'
    when v_collection_count>=2 and v_paid_pct>=80 and v_oldest_days<=7 then 'Thanh toán tốt'
    when v_collection_count>0 then 'Còn nợ · có trả tiền'
    else 'Chưa ghi nhận thu tiền' end;
  v_payload := v_payload || jsonb_build_object(
    'body',v_body,'allocation_policy','fifo_display_only',
    'oldest_unpaid_at',v_oldest,
    'oldest_unpaid_days',case when v_state='debt' then v_oldest_days else null end,
    'admin_assessment',jsonb_build_object(
      'purchase_segment',v_purchase_segment,'payment_segment',v_payment_segment,
      'sale_count',v_sale_count,'purchase_days',v_purchase_days,
      'collection_count',v_collection_count,'paid_pct',v_paid_pct
    )
  );
  v_message_id := public.taphoa_chat_notify_customer(
    p_customer_id,v_actor,'debt-share:'||v_client_id,v_body
  );
  return v_payload || jsonb_build_object('message_id',v_message_id,'sent',v_message_id is not null);
end;
$function$

revoke all on function public.v21_admin_send_debt_summary(uuid,text) from public,anon;
grant execute on function public.v21_admin_send_debt_summary(uuid,text) to authenticated,service_role;
