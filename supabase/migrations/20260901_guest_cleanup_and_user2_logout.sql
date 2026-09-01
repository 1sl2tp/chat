create or replace function public.chat_end_guest_session()
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
  v_conversation_ids uuid[] := '{}'::uuid[];
  v_deleted_conversations integer := 0;
begin
  select auth_user_id, auth_session_id, is_anonymous
  into v_auth_user_id, v_auth_session_id, v_is_anonymous
  from chat_private.require_auth_context();

  if not coalesce(v_is_anonymous, false) then
    raise exception 'guest_session_required';
  end if;

  select p.id
  into v_profile_id
  from public.chat_profiles p
  where p.auth_user_id = v_auth_user_id
    and coalesce(p.is_admin, false) = false
    and coalesce(p.user_level, 1) = 1
  limit 1;

  if v_profile_id is null then
    return jsonb_build_object('ended', true, 'deleted_conversations', 0);
  end if;

  select s.device_id
  into v_device_id
  from public.chat_sessions s
  where s.auth_session_id = v_auth_session_id
    and s.profile_id = v_profile_id
  limit 1;

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into v_conversation_ids
  from public.chat_conversations c
  join public.chat_conversation_members me
    on me.conversation_id = c.id
   and me.profile_id = v_profile_id
  where c.type = 'direct'
    and exists (
      select 1
      from public.chat_conversation_members peer
      join public.chat_profiles admin_profile on admin_profile.id = peer.profile_id
      where peer.conversation_id = c.id
        and admin_profile.is_admin = true
        and lower(coalesce(admin_profile.username, '')) = 'admin'
    );

  if cardinality(v_conversation_ids) > 0 then
    update public.chat_conversation_members
    set last_read_message_id = null
    where conversation_id = any(v_conversation_ids);

    update public.chat_conversations
    set last_message_id = null
    where id = any(v_conversation_ids);

    delete from public.chat_conversations
    where id = any(v_conversation_ids);

    get diagnostics v_deleted_conversations = row_count;
  end if;

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

  return jsonb_build_object(
    'ended', true,
    'deleted_conversations', v_deleted_conversations
  );
end;
$function$;

revoke all on function public.chat_end_guest_session() from public;
grant execute on function public.chat_end_guest_session() to authenticated;

create or replace function public.chat_end_user_session()
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
    raise exception 'registered_session_required';
  end if;

  select p.id
  into v_profile_id
  from public.chat_profiles p
  where p.auth_user_id = v_auth_user_id
    and coalesce(p.is_admin, false) = false
    and coalesce(p.user_level, 1) >= 2
  limit 1;

  if v_profile_id is null then
    return jsonb_build_object('ended', true);
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

revoke all on function public.chat_end_user_session() from public;
grant execute on function public.chat_end_user_session() to authenticated;

-- One-time cleanup for anonymous User1 conversations created before the fixed
-- chat_end_guest_session() predicate was deployed.
do $cleanup$
declare
  v_conversation_ids uuid[] := '{}'::uuid[];
begin
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
  into v_conversation_ids
  from public.chat_conversations c
  join public.chat_conversation_members guest_member
    on guest_member.conversation_id = c.id
  join public.chat_profiles guest_profile
    on guest_profile.id = guest_member.profile_id
  join auth.users guest_auth
    on guest_auth.id = guest_profile.auth_user_id
   and guest_auth.is_anonymous = true
  where c.type = 'direct'
    and coalesce(guest_profile.is_admin, false) = false
    and coalesce(guest_profile.user_level, 1) = 1
    and exists (
      select 1
      from public.chat_conversation_members admin_member
      join public.chat_profiles admin_profile on admin_profile.id = admin_member.profile_id
      where admin_member.conversation_id = c.id
        and admin_profile.is_admin = true
        and lower(coalesce(admin_profile.username, '')) = 'admin'
    );

  if cardinality(v_conversation_ids) > 0 then
    update public.chat_conversation_members
    set last_read_message_id = null
    where conversation_id = any(v_conversation_ids);

    update public.chat_conversations
    set last_message_id = null
    where id = any(v_conversation_ids);

    delete from public.chat_conversations
    where id = any(v_conversation_ids);
  end if;

  delete from public.chat_sessions s
  using public.chat_profiles p, auth.users u
  where s.profile_id = p.id
    and p.auth_user_id = u.id
    and u.is_anonymous = true
    and coalesce(p.is_admin, false) = false
    and coalesce(p.user_level, 1) = 1;

  delete from public.chat_devices d
  using public.chat_profiles p, auth.users u
  where d.profile_id = p.id
    and p.auth_user_id = u.id
    and u.is_anonymous = true
    and coalesce(p.is_admin, false) = false
    and coalesce(p.user_level, 1) = 1
    and not exists (
      select 1 from public.chat_sessions s where s.device_id = d.id
    );
end;
$cleanup$;
