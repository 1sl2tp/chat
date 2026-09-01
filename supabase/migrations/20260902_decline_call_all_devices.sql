create or replace function public.chat_decline_voice_call(p_call_id uuid, p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'chat_private'
as $function$
declare
  v_actor uuid := public.chat_current_profile_id();
  v_call public.chat_calls%rowtype;
begin
  if v_actor is null then raise exception 'session_revoked'; end if;
  perform chat_private.expire_stale_voice_calls();
  if not chat_private.device_belongs_to_profile(p_device_id, v_actor) then raise exception 'invalid_device'; end if;

  select * into v_call
  from public.chat_calls
  where id = p_call_id
  for update;

  if not found then raise exception 'call_not_found'; end if;
  if v_actor <> v_call.callee_profile_id then raise exception 'not_callee'; end if;

  if v_call.state <> 'ringing' then
    if v_call.accepted_device_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'already_answered', 'accepted_device_id', v_call.accepted_device_id);
    end if;
    return jsonb_build_object('ok', true, 'state', v_call.state);
  end if;

  update public.chat_call_device_targets
  set state='declined', responded_at=now()
  where call_id=p_call_id and state='ringing';

  update public.chat_calls
  set state='declined',ended_at=now(),end_reason='declined',updated_at=now(),version=version+1
  where id=p_call_id;

  return jsonb_build_object('ok', true, 'state', 'declined', 'remaining_devices', 0);
end;
$function$;
