-- Fixed one-off Zalo preview for the explicitly requested linked friend.
-- Only service workers can execute. No arbitrary recipient, body or sender args.
create or replace function v21_private.taphoa_daily_consultation_send_preview()
returns jsonb
language plpgsql
security definer
set search_path='public','v21_private','pg_temp'
as $fn$
declare
  v_admin uuid;
  v_contact uuid;
  v_zalo text;
  v_conversation uuid;
  v_message uuid;
  v_body text;
  v_client text := 'advisory:general:zalo-preview:gd-cha-yeu:20261106';
  v_state text;
  v_zalo_message_id text;
begin
  if not pg_try_advisory_xact_lock(hashtextextended(v_client,0)) then
    return jsonb_build_object('ok',true,'status','busy');
  end if;

  select l.linked_by_account_id,l.chat_account_id,z.zalo_id
  into v_admin,v_contact,v_zalo
  from public.zalo_contacts z
  join public.zalo_user_links l on l.zalo_id=z.zalo_id
  join public.v21_accounts sender on sender.id=l.linked_by_account_id
  join public.v21_accounts recipient on recipient.id=l.chat_account_id
  where z.display_name='gd cha yeu' and z.thread_type='user'
    and recipient.username='buita' and recipient.role='user'
    and recipient.deleted_at is null and recipient.locked_at is null
    and sender.role='admin' and sender.deleted_at is null and sender.locked_at is null
  order by l.linked_at desc limit 1;

  if v_admin is null or v_contact is null then
    return jsonb_build_object('ok',false,'status','target_link_missing');
  end if;

  select id into v_conversation
  from public.v21_conversations
  where (member_a=v_admin and member_b=v_contact)
     or (member_b=v_admin and member_a=v_contact)
  order by created_at desc limit 1;

  if v_conversation is null then
    return jsonb_build_object('ok',false,'status','conversation_missing');
  end if;

  v_body := '[TIN THỬ TRÌNH BÀY - 09:00 HẰNG NGÀY]'||E'\n\n'||
            v21_private.taphoa_daily_consultation_text(now());
  if char_length(v_body)>8000 then
    return jsonb_build_object('ok',false,'status','message_too_long');
  end if;

  insert into public.v21_messages(conversation_id,sender_account_id,client_id,body)
  values(v_conversation,v_admin,v_client,v_body)
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing returning id into v_message;

  if v_message is null then
    select m.id into v_message
    from public.v21_messages m
    where m.sender_account_id=v_admin and m.client_id=v_client
      and m.conversation_id=v_conversation and m.deleted_at is null
    limit 1;
  end if;
  if v_message is null then
    return jsonb_build_object('ok',false,'status','idempotency_conflict');
  end if;

  select state,zalo_message_id into v_state,v_zalo_message_id
  from public.zalo_message_links
  where chat_message_id=v_message and direction='outbound' and zalo_id=v_zalo
  order by created_at desc limit 1;

  if v_state is null then
    raise exception 'preview_zalo_outbox_missing';
  end if;

  return jsonb_build_object(
    'ok',true,'message_id',v_message,'state',v_state,
    'zalo_message_id',v_zalo_message_id,'recipient','gd cha yeu'
  );
end;
$fn$;
revoke all on function v21_private.taphoa_daily_consultation_send_preview()
from public,anon,authenticated;
grant execute on function v21_private.taphoa_daily_consultation_send_preview()
to service_role;
