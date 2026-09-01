create or replace function public.chat_send_text_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_text text,
  p_reply_to_id uuid
)
returns public.chat_messages
language plpgsql
security definer
set search_path to 'public', 'chat_private'
as $function$
declare
  v_me uuid := public.chat_current_profile_id();
  v_type text;
  v_peer uuid;
  v_admin_bridge boolean := false;
  v_allowed boolean;
  v_reason text;
  v_result public.chat_messages;
  v_clean_text text := btrim(coalesce(p_text, ''));
begin
  if v_me is null then raise exception 'session_revoked'; end if;
  if p_client_message_id is null then raise exception 'client_message_id required'; end if;
  if v_clean_text = '' then raise exception 'empty message'; end if;
  if not chat_private.is_active_member(v_me, p_conversation_id) then raise exception 'not_member'; end if;

  select c.type into v_type from public.chat_conversations c where c.id = p_conversation_id;
  if not found then raise exception 'conversation not found'; end if;

  if p_reply_to_id is not null and not exists (
    select 1
    from public.chat_messages m
    where m.id = p_reply_to_id
      and m.conversation_id = p_conversation_id
  ) then
    raise exception 'reply_message_not_in_conversation';
  end if;

  if v_type = 'direct' then
    v_peer := chat_private.direct_peer(v_me, p_conversation_id);
    select exists(
      select 1
      from public.chat_profiles p
      where p.id in (v_me, v_peer)
        and p.is_admin = true
    ) into v_admin_bridge;

    if not v_admin_bridge then
      select c.allowed, c.reason into v_allowed, v_reason
      from chat_private.capability(v_me, 'send_direct_text', v_peer, p_conversation_id) c;
      if not v_allowed then raise exception '%', v_reason; end if;
    end if;
  end if;

  insert into public.chat_messages(
    conversation_id,
    sender_id,
    client_message_id,
    type,
    text,
    reply_to_id
  )
  values(
    p_conversation_id,
    v_me,
    p_client_message_id,
    'text',
    v_clean_text,
    p_reply_to_id
  )
  on conflict (sender_id, client_message_id)
  do update set text = public.chat_messages.text
  returning * into v_result;

  if v_type = 'direct' and v_admin_bridge and v_peer is not null then
    perform chat_private.enqueue_notification('chat_message', v_result.id, v_peer);
  end if;

  return v_result;
end;
$function$;

create or replace function public.chat_start_voice_call(
  p_conversation_id uuid,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'chat_private'
as $function$
declare
  v_actor uuid := public.chat_current_profile_id();
  v_target uuid;
  v_allowed boolean;
  v_reason text;
  v_call_id uuid;
begin
  if v_actor is null then raise exception 'session_revoked'; end if;
  if not chat_private.device_belongs_to_profile(p_device_id, v_actor) then raise exception 'invalid_device'; end if;
  if not chat_private.is_active_member(v_actor, p_conversation_id) then raise exception 'not_member'; end if;

  v_target := chat_private.direct_peer(v_actor, p_conversation_id);
  if v_target is null then raise exception 'direct_call_only'; end if;

  select c.allowed, c.reason into v_allowed, v_reason
  from chat_private.can_start_voice_call(v_actor, v_target) c;
  if not coalesce(v_allowed, false) then
    raise exception '%', coalesce(v_reason, 'call_not_allowed');
  end if;

  if v_actor::text < v_target::text then
    perform pg_advisory_xact_lock(hashtext(v_actor::text));
    perform pg_advisory_xact_lock(hashtext(v_target::text));
  else
    perform pg_advisory_xact_lock(hashtext(v_target::text));
    perform pg_advisory_xact_lock(hashtext(v_actor::text));
  end if;

  perform chat_private.expire_stale_voice_calls();

  v_call_id := null;
  select c.id into v_call_id
  from public.chat_calls c
  where (c.caller_profile_id = v_actor or c.callee_profile_id = v_actor)
    and c.state in ('ringing', 'accepted', 'connecting', 'connected')
  order by c.created_at desc
  limit 1;

  if v_call_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'caller_busy', 'call_id', v_call_id);
  end if;

  v_call_id := null;
  select c.id into v_call_id
  from public.chat_calls c
  where (c.caller_profile_id = v_target or c.callee_profile_id = v_target)
    and c.state in ('ringing', 'accepted', 'connecting', 'connected')
  order by c.created_at desc
  limit 1;

  if v_call_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'peer_busy', 'call_id', v_call_id);
  end if;

  begin
    insert into public.chat_calls(
      conversation_id,
      caller_profile_id,
      callee_profile_id,
      caller_device_id
    )
    values(p_conversation_id, v_actor, v_target, p_device_id)
    returning id into v_call_id;
  exception when unique_violation then
    select c.id into v_call_id
    from public.chat_calls c
    where least(c.caller_profile_id, c.callee_profile_id) = least(v_actor, v_target)
      and greatest(c.caller_profile_id, c.callee_profile_id) = greatest(v_actor, v_target)
      and c.state in ('ringing', 'accepted', 'connecting', 'connected')
    order by c.created_at desc
    limit 1;

    return jsonb_build_object('ok', false, 'reason', 'call_already_active', 'call_id', v_call_id);
  end;

  insert into public.chat_call_device_targets(call_id, profile_id, device_id, state)
  select distinct v_call_id, v_target, d.id, 'ringing'
  from public.chat_devices d
  join public.chat_sessions s
    on s.device_id = d.id
   and s.profile_id = d.profile_id
  where d.profile_id = v_target
    and d.revoked_at is null
    and s.revoked_at is null
    and d.last_seen_at >= now() - interval '5 minutes'
    and s.last_seen_at >= now() - interval '5 minutes'
  on conflict(call_id, device_id) do nothing;

  perform chat_private.enqueue_notification('incoming_call', v_call_id, v_target);

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'state', 'ringing',
    'callee_profile_id', v_target
  );
end;
$function$;
