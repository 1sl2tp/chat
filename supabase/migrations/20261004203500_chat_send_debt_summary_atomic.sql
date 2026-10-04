-- Atomic owner for Chat Admin debt sharing.
create or replace function public.v21_admin_send_debt_summary(
  p_customer_id uuid,
  p_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public,v21_private,pg_temp
as $function$
declare
  v_actor uuid := v21_private.current_active_account_id();
  v_payload jsonb;
  v_message_id uuid;
  v_client_id text := left(btrim(coalesce(p_client_id,'')),100);
begin
  if v_actor is null or not exists(
    select 1 from public.v21_accounts a
    where a.id=v_actor
      and a.role='admin'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'admin_required' using errcode='42501';
  end if;

  if v_client_id='' then
    raise exception 'client_id_required';
  end if;

  v_payload := v21_private.debt_share_summary_payload(p_customer_id,now());

  v_message_id := public.taphoa_chat_notify_customer(
    p_customer_id,
    v_actor,
    'debt-share:' || v_client_id,
    v_payload->>'body'
  );

  return v_payload || jsonb_build_object(
    'message_id',v_message_id,
    'sent',v_message_id is not null
  );
end;
$function$;

revoke all on function public.v21_admin_send_debt_summary(uuid,text)
from public,anon;
grant execute on function public.v21_admin_send_debt_summary(uuid,text)
to authenticated,service_role;
