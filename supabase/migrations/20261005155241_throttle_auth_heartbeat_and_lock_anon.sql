create or replace function public.v21_auth_heartbeat(p_app_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_auth_session_id uuid := v21_private.current_auth_session_id();
  v_session public.v21_sessions;
  v_account public.v21_accounts;
begin
  if auth.uid() is null or v_auth_session_id is null then raise exception 'authentication_required'; end if;

  select s.* into v_session
  from public.v21_sessions s
  join public.v21_accounts a on a.id=s.account_id
  where s.app_session_id=p_app_session_id
    and s.auth_session_id=v_auth_session_id
    and a.auth_user_id=auth.uid()
    and a.deleted_at is null
    and a.locked_at is null
  limit 1;

  if not found or v_session.revoked_at is not null then raise exception 'session_revoked'; end if;

  update public.v21_sessions
     set last_seen_at=now()
   where app_session_id=v_session.app_session_id
     and last_seen_at < now()-interval '5 minutes';

  update public.v21_devices
     set last_seen_at=now()
   where id=v_session.device_id
     and last_seen_at < now()-interval '5 minutes';

  select * into v_account from public.v21_accounts where id=v_session.account_id;

  return jsonb_build_object(
    'ok',true,
    'account',jsonb_build_object(
      'id',v_account.id,
      'username',v_account.username,
      'display_name',v_account.display_name,
      'role',v_account.role,
      'avatar_path',v_account.avatar_path,
      'locked_at',v_account.locked_at
    ),
    'app_session_id',v_session.app_session_id,
    'device_id',v_session.device_id
  );
end;
$$;

revoke execute on function public.v21_auth_heartbeat(uuid) from public, anon;
grant execute on function public.v21_auth_heartbeat(uuid) to authenticated, service_role;
