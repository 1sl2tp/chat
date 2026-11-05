-- One-off, fixed-destination full-length preview split into Zalo-sized messages.
-- Exact recipient and campaign are fixed: cannot be used as a general send endpoint.
create or replace function v21_private.taphoa_daily_consultation_send_full_preview()
returns jsonb
language plpgsql
security definer
set search_path='public','v21_private','pg_temp'
as $fn$
declare
  v_sender uuid;
  v_target uuid;
  v_conversation uuid;
  v_zalo text;
  v_full text;
  v_lines text[];
  v_parts text[] := array[]::text[];
  v_current text;
  v_n integer;
  v_i integer;
  v_msg uuid;
  v_client text;
  v_ids uuid[] := array[]::uuid[];
  v_prefix text;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('advisory:general:zalo-preview:gd-cha-yeu:20261106:full',0)) then
    return jsonb_build_object('ok',true,'status','busy');
  end if;

  select l.linked_by_account_id,l.chat_account_id,z.zalo_id
    into v_sender,v_target,v_zalo
  from public.zalo_contacts z
  join public.zalo_user_links l on l.zalo_id=z.zalo_id
  join public.v21_accounts a on a.id=l.linked_by_account_id
  join public.v21_accounts t on t.id=l.chat_account_id
  where z.display_name='gd cha yeu' and z.thread_type='user'
    and t.username='buita' and t.role='user'
    and a.role='admin'
    and t.deleted_at is null and t.locked_at is null
    and a.deleted_at is null and a.locked_at is null
  order by l.linked_at desc limit 1;
  if v_sender is null or v_target is null then
    return jsonb_build_object('ok',false,'status','linked_recipient_missing');
  end if;
  select id into v_conversation
  from public.v21_conversations
  where (member_a=v_sender and member_b=v_target)
     or (member_b=v_sender and member_a=v_target)
  order by created_at desc limit 1;
  if v_conversation is null then
    return jsonb_build_object('ok',false,'status','conversation_missing');
  end if;

  v_full:=v21_private.taphoa_daily_consultation_text(now());
  v_lines:=string_to_array(v_full,E'\n');
  if cardinality(v_lines)=0 then
    return jsonb_build_object('ok',false,'status','content_empty');
  end if;
  v_current:=v_lines[1];
  for v_i in 2..cardinality(v_lines) loop
    if char_length(v_current)+1+char_length(v_lines[v_i])>1400 then
      v_parts:=array_append(v_parts,v_current);
      v_current:=v_lines[v_i];
    else
      v_current:=v_current||E'\n'||v_lines[v_i];
    end if;
  end loop;
  v_parts:=array_append(v_parts,v_current);
  v_n:=cardinality(v_parts);
  if v_n>10 or v_n<2 then
    return jsonb_build_object('ok',false,'status','invalid_part_count','parts',v_n);
  end if;
  if array_to_string(v_parts,E'\n')<>v_full then
    raise exception 'split_integrity_failed';
  end if;
  for v_i in 1..v_n loop
    if char_length(v_parts[v_i])>1400 then
      raise exception 'preview_part_too_long:%',v_i;
    end if;
    v_prefix:='[TIN THỬ TƯ VẤN 09:00 - PHẦN '||v_i::text||'/'||v_n::text||']';
    v_client:='advisory:general:zalo-preview:gd-cha-yeu:20261106:full:'||lpad(v_i::text,2,'0');
    v_msg:=null;
    insert into public.v21_messages(conversation_id,sender_account_id,client_id,body)
    values(v_conversation,v_sender,v_client,v_prefix||E'\n'||v_parts[v_i])
    on conflict on constraint v21_messages_sender_account_id_client_id_key
    do nothing returning id into v_msg;
    if v_msg is null then
      select id into v_msg from public.v21_messages
      where sender_account_id=v_sender and conversation_id=v_conversation
        and client_id=v_client and deleted_at is null limit 1;
    end if;
    if v_msg is null then raise exception 'preview_part_not_saved:%',v_i; end if;
    v_ids:=array_append(v_ids,v_msg);
  end loop;
  if (select count(*) from public.zalo_message_links
      where chat_message_id=any(v_ids) and direction='outbound'
        and zalo_id=v_zalo) <> v_n then
    raise exception 'preview_outbox_count_incomplete';
  end if;
  return jsonb_build_object('ok',true,'status','queued','recipient','gd cha yeu',
    'parts',v_n,'full_length',char_length(v_full),'message_ids',to_jsonb(v_ids));
end;
$fn$;

revoke all on function v21_private.taphoa_daily_consultation_send_full_preview()
from public,anon,authenticated;
grant execute on function v21_private.taphoa_daily_consultation_send_full_preview()
to service_role;