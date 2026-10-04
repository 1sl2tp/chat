-- Chat Admin "Công nợ" composer action must send a polite debt summary,
-- not a bare public URL.
-- Debt age means the current continuous positive-balance period. Payments are
-- balance-level, so we never claim that a specific order remains unpaid.

create or replace function v21_private.debt_share_summary_payload(
  p_customer_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public,v21_private,pg_temp
as $function$
declare
  v_balance numeric := 0;
  v_debt_since timestamptz;
  v_debt_days integer := 0;
  v_order_count integer := 0;
  v_url text;
  v_local timestamp := coalesce(p_now,now()) at time zone 'Asia/Ho_Chi_Minh';
  v_weekday text;
  v_body text;
  v_state text;
begin
  if p_customer_id is null or not exists(
    select 1
    from public.v21_accounts a
    where a.id=p_customer_id
      and a.role='user'
      and a.contact_group='customer'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'customer_not_found';
  end if;

  select coalesce(sum(l.amount_vnd),0)
  into v_balance
  from public.taphoa_debt_ledger l
  where l.customer_account_id=p_customer_id;

  v_url := public.taphoa_customer_mini_link(
    p_customer_id,'no',null,null,null
  );

  v_weekday := case extract(isodow from v_local)::int
    when 1 then 'Thứ Hai'
    when 2 then 'Thứ Ba'
    when 3 then 'Thứ Tư'
    when 4 then 'Thứ Năm'
    when 5 then 'Thứ Sáu'
    when 6 then 'Thứ Bảy'
    else 'Chủ nhật'
  end;

  if v_balance > 0 then
    with ordered as (
      select
        l.id,
        l.created_at,
        l.order_id,
        l.entry_type,
        row_number() over(order by l.created_at,l.id) as rn,
        sum(l.amount_vnd) over(
          order by l.created_at,l.id
          rows between unbounded preceding and current row
        ) as running_balance
      from public.taphoa_debt_ledger l
      where l.customer_account_id=p_customer_id
    ),
    boundary as (
      select coalesce(max(rn) filter(where running_balance<=0),0) as last_nonpositive_rn
      from ordered
    )
    select min(o.created_at)
    into v_debt_since
    from ordered o
    cross join boundary b
    where o.rn>b.last_nonpositive_rn
      and o.running_balance>0;

    if v_debt_since is null then
      select min(l.created_at)
      into v_debt_since
      from public.taphoa_debt_ledger l
      where l.customer_account_id=p_customer_id
        and l.amount_vnd>0;
    end if;

    if v_debt_since is not null then
      v_debt_days := greatest(
        0,
        v_local::date - (v_debt_since at time zone 'Asia/Ho_Chi_Minh')::date
      );

      select count(distinct l.order_id)::int
      into v_order_count
      from public.taphoa_debt_ledger l
      join public.taphoa_orders o on o.id=l.order_id
      where l.customer_account_id=p_customer_id
        and l.entry_type='sale'
        and l.order_id is not null
        and o.status='delivered'
        and l.created_at>=v_debt_since;
    end if;

    v_state := 'debt';
    v_body :=
      'Đối chiếu công nợ · ' || v_weekday || ', ' || to_char(v_local,'DD/MM')
      || E'\nHiện anh/chị còn công nợ ' || public.taphoa_chat_money(v_balance) || '.'
      || case
           when v_debt_since is null then ''
           when v_debt_days=0 then E'\nĐợt công nợ này phát sinh hôm nay.'
           else E'\nĐợt công nợ hiện tại bắt đầu từ '
             || to_char(v_debt_since at time zone 'Asia/Ho_Chi_Minh','DD/MM')
             || ' (' || v_debt_days || ' ngày).'
         end
      || case
           when v_order_count>0 then E'\nTrong thời gian này có '
             || v_order_count || ' đơn đã giao và hiện vẫn còn số dư chưa thanh toán hết.'
           else E'\nHiện vẫn còn số dư chưa thanh toán hết.'
         end
      || E'\nAnh/chị vui lòng kiểm tra giúp em. Nếu có khoản nào chưa khớp, anh/chị nhắn lại để em kiểm tra ngay.'
      || case when coalesce(v_url,'')<>'' then
           E'\nXem chi tiết công nợ: ' || v_url
         else '' end;

  elsif v_balance < 0 then
    v_state := 'surplus';
    v_body :=
      'Đối chiếu công nợ · ' || v_weekday || ', ' || to_char(v_local,'DD/MM')
      || E'\nHiện tài khoản của anh/chị đang dư ' || public.taphoa_chat_money(abs(v_balance)) || '.'
      || E'\nAnh/chị vui lòng kiểm tra giúp em. Nếu có khoản nào chưa khớp, anh/chị nhắn lại để em kiểm tra ngay.'
      || case when coalesce(v_url,'')<>'' then
           E'\nXem chi tiết công nợ: ' || v_url
         else '' end;

  else
    v_state := 'settled';
    v_body :=
      'Đối chiếu công nợ · ' || v_weekday || ', ' || to_char(v_local,'DD/MM')
      || E'\nHiện công nợ của anh/chị đã được thanh toán đầy đủ.'
      || E'\nAnh/chị có thể xem lại lịch sử giao dịch tại đây:'
      || case when coalesce(v_url,'')<>'' then E'\n' || v_url else '' end;
  end if;

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'state',v_state,
    'balance',v_balance,
    'debt_since',v_debt_since,
    'debt_days',case when v_state='debt' then v_debt_days else null end,
    'delivered_order_count',case when v_state='debt' then v_order_count else null end,
    'url',v_url,
    'body',v_body
  );
end;
$function$;

revoke all on function v21_private.debt_share_summary_payload(uuid,timestamptz)
from public,anon,authenticated;
grant execute on function v21_private.debt_share_summary_payload(uuid,timestamptz)
to postgres,service_role;

create or replace function public.v21_admin_debt_share_summary(
  p_customer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public,v21_private,pg_temp
as $function$
declare
  v_actor uuid := v21_private.current_active_account_id();
begin
  if v_actor is null or not exists(
    select 1
    from public.v21_accounts a
    where a.id=v_actor
      and a.role='admin'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'admin_required' using errcode='42501';
  end if;

  return v21_private.debt_share_summary_payload(p_customer_id,now());
end;
$function$;

revoke all on function public.v21_admin_debt_share_summary(uuid)
from public,anon;
grant execute on function public.v21_admin_debt_share_summary(uuid)
to authenticated,service_role;
