-- Narrow sender for daily advice. Test goes only to internal "test";
-- scheduled sending goes only to the verified Zalo group.
create or replace function v21_private.taphoa_daily_consultation_dispatch(
 p_test boolean default false,
 p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path='public','v21_private','pg_temp'
as $fn$
declare
 v_local timestamp := p_at at time zone 'Asia/Ho_Chi_Minh';
 v_date text := to_char(p_at at time zone 'Asia/Ho_Chi_Minh','YYYYMMDD');
 v_sender uuid;
 v_recipient uuid;
 v_conversation uuid;
 v_message uuid;
 v_text text;
 v_client_id text;
 v_zalo_id text;
 v_state text;
 v_zalo_message_id text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('advisory:daily:'||v_date,0)) then
  return jsonb_build_object('ok',true,'status','busy');
 end if;
 if not p_test and (v_local::time < time '09:00' or v_local::time >= time '09:30') then
  return jsonb_build_object('ok',true,'status','outside_window');
 end if;

 select l.linked_by_account_id,l.chat_account_id,z.zalo_id
 into v_sender,v_recipient,v_zalo_id
 from public.zalo_contacts z
 join public.zalo_user_links l on l.zalo_id=z.zalo_id
 join public.v21_accounts admin_account on admin_account.id=l.linked_by_account_id
 join public.v21_accounts target on target.id=l.chat_account_id
 where z.display_name='Báo Giá - 0911479555' and z.thread_type='group'
 and admin_account.role='admin'
 and admin_account.deleted_at is null and admin_account.locked_at is null
 and target.role='user' and target.deleted_at is null and target.locked_at is null
 order by l.linked_at desc limit 1;
 if v_sender is null or v_recipient is null then
  return jsonb_build_object('ok',false,'status','group_link_missing');
 end if;

 if p_test then
  select id into v_recipient from public.v21_accounts
  where username='test' and role='user'
    and deleted_at is null and locked_at is null
  limit 1;
  if v_recipient is null then
   return jsonb_build_object('ok',false,'status','test_account_missing');
  end if;
 end if;

 select c.id into v_conversation
 from public.v21_conversations c
 where (c.member_a=v_sender and c.member_b=v_recipient)
    or (c.member_b=v_sender and c.member_a=v_recipient)
 order by c.created_at desc limit 1;
 if v_conversation is null then
  return jsonb_build_object('ok',false,'status','conversation_missing');
 end if;

 v_client_id:='advisory:general:'||case when p_test then 'test:' else 'group:' end||v_date;
 v_text:=v21_private.taphoa_daily_consultation_text(p_at);
 if p_test then
  v_text:='[TIN THỬ NỘI BỘ - test]'||E'\n\n'||v_text;
 end if;
 if char_length(v_text)>8000 then
  return jsonb_build_object('ok',false,'status','message_too_long');
 end if;

 insert into public.v21_messages(conversation_id,sender_account_id,client_id,body)
 values(v_conversation,v_sender,v_client_id,v_text)
 on conflict on constraint v21_messages_sender_account_id_client_id_key
 do nothing returning id into v_message;

 if v_message is null then
  select m.id into v_message from public.v21_messages m
  where m.sender_account_id=v_sender and m.client_id=v_client_id
    and m.conversation_id=v_conversation and m.deleted_at is null
  limit 1;
  if v_message is null then
   return jsonb_build_object('ok',false,'status','idempotency_conflict');
  end if;
 end if;

 if p_test then
  return jsonb_build_object('ok',true,'status','chat_test_created',
    'message_id',v_message,'recipient','test');
 end if;

 select z.state,z.zalo_message_id into v_state,v_zalo_message_id
 from public.zalo_message_links z
 where z.chat_message_id=v_message and z.zalo_id=v_zalo_id
  and z.direction='outbound'
 order by z.created_at desc limit 1;
 if v_state is null then
  raise exception 'daily_consultation_zalo_outbox_missing';
 end if;
 return jsonb_build_object(
  'ok',true,'status',v_state,'message_id',v_message,
  'recipient','Báo Giá - 0911479555',
  'zalo_message_id',v_zalo_message_id,
  'local_date',v_date
 );
end;
$fn$;

revoke all on function v21_private.taphoa_daily_consultation_dispatch(boolean,timestamptz)
from public,anon,authenticated;
grant execute on function v21_private.taphoa_daily_consultation_dispatch(boolean,timestamptz)
to service_role;
comment on function v21_private.taphoa_daily_consultation_dispatch(boolean,timestamptz)
is 'Service-only admin dispatch; test targets only test; live targets only one Zalo group with client-id daily deduplication.';
