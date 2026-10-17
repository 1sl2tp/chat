-- Admin-only preview for the + composer action "Tư vấn hàng mới bán".
-- Does not send messages or re-enable the automated care scheduler.
create or replace function public.chat_admin_recent_sales_preview(p_customer_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_ctx jsonb;
  v_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_message jsonb;
begin
  v_ctx := public.platform_account_context();
  if coalesce((v_ctx->>'allowed')::boolean,false) is not true
    or coalesce(v_ctx->>'account_class','') <> 'admin'
    or coalesce((v_ctx->'apps'->'chat'->>'allowed')::boolean,false) is not true
  then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_customer_id is null or not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id and a.role='user'
      and a.contact_group='customer' and a.deleted_at is null and a.locked_at is null
  ) then
    raise exception 'customer_not_found';
  end if;
  v_message := public.chat_customer_care_message(p_customer_id,v_date);
  return jsonb_build_object(
    'ok',true,'customer_id',p_customer_id,
    'date_from',v_date-1,'date_to',v_date,
    'product_count',coalesce(jsonb_array_length(v_message->'suggestions'),0),
    'body',v_message->>'body','link',v_message->>'link'
  );
end;
$function$;
revoke all on function public.chat_admin_recent_sales_preview(uuid) from public,anon;
grant execute on function public.chat_admin_recent_sales_preview(uuid) to authenticated;
comment on function public.chat_admin_recent_sales_preview(uuid) is
'Read-only KH 2-day sold-products digest with static promo lines for manual one-to-one Chat preview; never schedules/sends care messages.';
