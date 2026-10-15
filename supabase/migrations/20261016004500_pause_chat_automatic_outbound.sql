-- Emergency business decision 2026-10-16: pause all automated KH Chat/Zalo notices.
-- Keep manual Chat, human-sent messages, orders, debt ledger and realtime working.
-- Resume only after explicit decision; enabled=true in private control and
-- schedules must each be reviewed before reactivation.
BEGIN;
CREATE TABLE IF NOT EXISTS v21_private.chat_automatic_outbound_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'Paused by owner 2026-10-16'
);
ALTER TABLE v21_private.chat_automatic_outbound_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON v21_private.chat_automatic_outbound_control FROM public, anon, authenticated;
INSERT INTO v21_private.chat_automatic_outbound_control(singleton,enabled,reason)
VALUES(true,false,'Paused automated KH Chat/Zalo at owner request 2026-10-16')
ON CONFLICT(singleton) DO UPDATE SET enabled=false,updated_at=now(),reason=excluded.reason;

DO $pause_cron$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT jobid FROM cron.job WHERE active AND (
      command ILIKE '%chat_customer_care_refresh(%' OR
      command ILIKE '%chat_customer_care_send_due(%'
    )
  LOOP
    PERFORM cron.alter_job(v.jobid, active => false);
  END LOOP;
END;
$pause_cron$;

CREATE OR REPLACE FUNCTION public.taphoa_chat_notify_customer(p_customer_id uuid, p_sender_account_id uuid, p_client_id text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_client_id text := left(btrim(coalesce(p_client_id,'')),120);
  v_body text := btrim(coalesce(p_body,''));
  v_display_code text;
  v_prefix text;
  v_no bigint;
  v_order public.taphoa_orders;
  v_order_json jsonb;
  v_amount_text text;
  v_balance numeric;
  v_url text;
begin
  -- Global pause for AUTOMATED customer messages only.
  -- Preserve manual Chat/Zalo, order creation, debt records and sync.
  if (
    left(btrim(coalesce(p_client_id,'')),120) like 'taphoa:%'
    or left(btrim(coalesce(p_client_id,'')),120) like 'care:auto:%'
  ) and coalesce((
    select not c.enabled
    from v21_private.chat_automatic_outbound_control c
    where c.singleton is true
  ),true) then
    return null;
  end if;
  if p_customer_id is null or p_sender_account_id is null then
    return null;
  end if;
  if v_client_id='' then raise exception 'chat_client_id_required'; end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_sender_account_id
      and a.role='admin'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'chat_sender_not_admin' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id
      and a.role='user'
      and a.contact_group='customer'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'chat_customer_not_found';
  end if;

  if v_client_id like 'taphoa:%:order'
     and lower(v_body) like '%đã được sửa%' then
    if v_body like '%Không có thay đổi nội dung.%' then
      return null;
    end if;

    v_display_code := upper(substring(v_body from '((DG|DT)[0-9]+)'));
    if v_display_code is not null then
      v_prefix := substring(v_display_code from '^([A-Z]+)');
      v_no := nullif(substring(v_display_code from '([0-9]+)$'),'')::bigint;

      select *
      into v_order
      from public.taphoa_orders o
      where o.customer_account_id=p_customer_id
        and o.display_prefix=v_prefix
        and o.display_no=v_no
      order by o.updated_at desc
      limit 1;

      if found then
        v_order_json := public.taphoa_order_frontend_json(v_order);
        v_body := public.taphoa_chat_order_receipt(v_order_json,'Cập nhật',null);
      end if;
    end if;
  end if;

  if v_client_id like 'taphoa:%:collection' then
    v_amount_text := btrim(regexp_replace(split_part(v_body,E'\n',1),'^Đã thu[[:space:]]+','','i'));
    if v_amount_text='' then v_amount_text := '0'; end if;
    v_balance := public.taphoa_chat_customer_balance_value(p_customer_id);
    v_url := public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);

    v_body := 'Đã thu ' || v_amount_text
      || ' · ' || public.taphoa_chat_balance_label(v_balance,false)
      || E'\n' || public.taphoa_chat_when(now());

    if v_url is not null then
      v_body := v_body || E'\nXem công nợ: ' || v_url;
    end if;
  end if;

  if v_body='' or char_length(v_body)>8000 then raise exception 'chat_message_invalid'; end if;

  select c.id
  into v_conversation_id
  from public.v21_conversations c
  left join lateral (
    select max(m.created_at) as latest_at
    from public.v21_messages m
    where m.conversation_id=c.id
      and m.deleted_at is null
      and m.client_id not like 'taphoa:%'
  ) activity on true
  where (
    c.member_a=p_sender_account_id and c.member_b=p_customer_id
  ) or (
    c.member_a=p_customer_id and c.member_b=p_sender_account_id
  )
  order by activity.latest_at desc nulls last,c.created_at desc,c.id
  limit 1;

  if v_conversation_id is null then
    if p_sender_account_id::text < p_customer_id::text then
      v_member_a := p_sender_account_id;
      v_member_b := p_customer_id;
    else
      v_member_a := p_customer_id;
      v_member_b := p_sender_account_id;
    end if;

    insert into public.v21_conversations(member_a,member_b)
    values(v_member_a,v_member_b)
    on conflict(member_a,member_b)
    do update set member_a=excluded.member_a
    returning id into v_conversation_id;
  end if;

  insert into public.v21_messages(conversation_id,sender_account_id,client_id,body)
  values(v_conversation_id,p_sender_account_id,v_client_id,v_body)
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id into v_message_id
    from public.v21_messages m
    where m.sender_account_id=p_sender_account_id
      and m.client_id=v_client_id
    limit 1;
  end if;

  return v_message_id;
end;
$function$


COMMIT;
