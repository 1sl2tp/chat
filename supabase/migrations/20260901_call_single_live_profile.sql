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

  -- Serialize all start-call decisions involving either profile. Lock both UUIDs
  -- in lexical order so opposite-direction attempts cannot deadlock.
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

  return jsonb_build_object(
    'ok', true,
    'call_id', v_call_id,
    'state', 'ringing',
    'callee_profile_id', v_target
  );
end;
$function$;
