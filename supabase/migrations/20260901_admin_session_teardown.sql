create or replace function public.chat_end_admin_session()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'chat_private'
as $function$
declare
  v_auth_user_id uuid;
  v_auth_session_id uuid;
  v_is_anonymous boolean;
  v_profile_id uuid;
  v_device_id uuid;
begin
  select auth_user_id, auth_session_id, is_anonymous
  into v_auth_user_id, v_auth_session_id, v_is_anonymous
  from chat_private.require_auth_context();

  if coalesce(v_is_anonymous, false) then
    raise exception 'admin_session_required';
  end if;

  select p.id
  into v_profile_id
  from public.chat_profiles p
  where p.auth_user_id = v_auth_user_id
    and coalesce(p.is_admin, false) = true
    and coalesce(p.user_level, 1) = 4
  limit 1;

  if v_profile_id is null then
    raise exception 'admin_session_required';
  end if;

  select s.device_id
  into v_device_id
  from public.chat_sessions s
  where s.auth_session_id = v_auth_session_id
    and s.profile_id = v_profile_id
  limit 1;

  delete from public.chat_sessions
  where auth_session_id = v_auth_session_id
    and profile_id = v_profile_id;

  if v_device_id is not null then
    delete from public.chat_devices d
    where d.id = v_device_id
      and d.profile_id = v_profile_id
      and not exists (
        select 1 from public.chat_sessions s where s.device_id = d.id
      );
  end if;

  return jsonb_build_object('ended', true);
end;
$function$;

revoke all on function public.chat_end_admin_session() from public;
grant execute on function public.chat_end_admin_session() to authenticated;
