alter table public.chat_profiles
  add column if not exists deleted_at timestamptz;

create index if not exists chat_profiles_active_user_level_idx
  on public.chat_profiles(user_level, last_seen_at desc)
  where deleted_at is null and is_admin = false;

create or replace function public.chat_admin_upgrade_guest(
  p_profile_id uuid,
  p_display_name text,
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'chat_private', 'auth', 'extensions'
as $function$
declare
  v_admin uuid := public.chat_current_profile_id();
  v_display text := btrim(coalesce(p_display_name, ''));
  v_username text := lower(trim(leading '@' from btrim(coalesce(p_username, ''))));
  v_password text := coalesce(p_password, '');
  v_email text;
  v_target public.chat_profiles;
begin
  if v_admin is null or not exists (
    select 1 from public.chat_profiles where id = v_admin and is_admin = true and user_level = 4
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if char_length(v_display) < 1 or char_length(v_display) > 50 then raise exception 'invalid_display_name'; end if;
  if v_username = 'admin' then raise exception 'reserved_username'; end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'invalid_username'; end if;
  if char_length(v_password) < 6 or char_length(v_password) > 128 then raise exception 'invalid_password'; end if;

  select * into v_target from public.chat_profiles where id = p_profile_id for update;
  if not found or v_target.deleted_at is not null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if v_target.is_admin or v_target.user_level <> 1 or v_target.auth_user_id is null then raise exception 'guest_required'; end if;

  if exists (select 1 from public.chat_profiles where id <> p_profile_id and deleted_at is null and lower(username) = v_username) then
    raise exception 'username_taken';
  end if;
  if exists (select 1 from public.chat_profile_aliases where username = v_username and profile_id <> p_profile_id and reserved_until > now()) then
    raise exception 'username_reserved';
  end if;

  v_email := v_username || '@taphoa.chat';
  if exists (select 1 from auth.users where id <> v_target.auth_user_id and lower(email) = v_email) then
    raise exception 'username_taken';
  end if;

  update auth.users
  set email = v_email,
      encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('username', v_username, 'display_name', v_display),
      is_anonymous = false,
      updated_at = now()
  where id = v_target.auth_user_id;

  insert into auth.identities(provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    v_target.auth_user_id::text,
    v_target.auth_user_id,
    jsonb_build_object('sub', v_target.auth_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  )
  on conflict (provider_id, provider) do update
  set identity_data = excluded.identity_data, updated_at = now();

  update public.chat_profiles
  set identity_type = 'taphoa', display_name = v_display, username = v_username,
      user_level = 2, guest_token = null, updated_at = now()
  where id = p_profile_id;

  update public.chat_sessions
  set is_anonymous = false
  where profile_id = p_profile_id and revoked_at is null;

  return jsonb_build_object('profile_id', p_profile_id, 'display_name', v_display, 'username', v_username, 'user_level', 2);
end;
$function$;

create or replace function public.chat_admin_update_user2(
  p_profile_id uuid,
  p_display_name text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'chat_private', 'auth'
as $function$
declare
  v_admin uuid := public.chat_current_profile_id();
  v_display text := btrim(coalesce(p_display_name, ''));
  v_username text := lower(trim(leading '@' from btrim(coalesce(p_username, ''))));
  v_email text;
  v_target public.chat_profiles;
  v_hold_days integer := chat_private.config_int('username_hold_days', 30);
begin
  if v_admin is null or not exists (
    select 1 from public.chat_profiles where id = v_admin and is_admin = true and user_level = 4
  ) then raise exception 'admin_required' using errcode = '42501'; end if;
  if char_length(v_display) < 1 or char_length(v_display) > 50 then raise exception 'invalid_display_name'; end if;
  if v_username = 'admin' then raise exception 'reserved_username'; end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'invalid_username'; end if;

  select * into v_target from public.chat_profiles where id = p_profile_id for update;
  if not found or v_target.deleted_at is not null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if v_target.is_admin or v_target.user_level <> 2 or v_target.auth_user_id is null then raise exception 'user2_required'; end if;

  delete from public.chat_profile_aliases where reserved_until <= now();
  if exists (select 1 from public.chat_profiles where id <> p_profile_id and deleted_at is null and lower(username) = v_username) then raise exception 'username_taken'; end if;
  if exists (select 1 from public.chat_profile_aliases where username = v_username and profile_id <> p_profile_id and reserved_until > now()) then raise exception 'username_reserved'; end if;

  v_email := v_username || '@taphoa.chat';
  if exists (select 1 from auth.users where id <> v_target.auth_user_id and lower(email) = v_email) then raise exception 'username_taken'; end if;

  if v_target.username is not null and lower(v_target.username) is distinct from v_username then
    insert into public.chat_profile_aliases(username, profile_id, reserved_until)
    values (lower(v_target.username), p_profile_id, now() + make_interval(days => v_hold_days))
    on conflict (username) do update set reserved_until = excluded.reserved_until
      where public.chat_profile_aliases.profile_id = excluded.profile_id;
  end if;
  delete from public.chat_profile_aliases where username = v_username and profile_id = p_profile_id;

  update public.chat_profiles
  set display_name = v_display, username = v_username, updated_at = now()
  where id = p_profile_id;

  update auth.users
  set email = v_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('username', v_username, 'display_name', v_display),
      updated_at = now()
  where id = v_target.auth_user_id;

  update auth.identities
  set identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object('email', v_email, 'email_verified', true),
      updated_at = now()
  where user_id = v_target.auth_user_id and provider = 'email';

  return jsonb_build_object('profile_id', p_profile_id, 'display_name', v_display, 'username', v_username, 'user_level', 2);
end;
$function$;

create or replace function public.chat_admin_reset_user2_password(
  p_profile_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = 'public', 'chat_private', 'auth', 'extensions'
as $function$
declare
  v_admin uuid := public.chat_current_profile_id();
  v_target public.chat_profiles;
  v_password text := coalesce(p_password, '');
begin
  if v_admin is null or not exists (
    select 1 from public.chat_profiles where id = v_admin and is_admin = true and user_level = 4
  ) then raise exception 'admin_required' using errcode = '42501'; end if;
  if char_length(v_password) < 6 or char_length(v_password) > 128 then raise exception 'invalid_password'; end if;

  select * into v_target from public.chat_profiles where id = p_profile_id for update;
  if not found or v_target.deleted_at is not null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if v_target.is_admin or v_target.user_level <> 2 or v_target.auth_user_id is null then raise exception 'user2_required'; end if;

  update auth.users
  set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')), updated_at = now()
  where id = v_target.auth_user_id;
end;
$function$;

create or replace function public.chat_admin_soft_delete_user(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public', 'chat_private', 'auth'
as $function$
declare
  v_admin uuid := public.chat_current_profile_id();
  v_target public.chat_profiles;
  v_auth_user_id uuid;
begin
  if v_admin is null or not exists (
    select 1 from public.chat_profiles where id = v_admin and is_admin = true and user_level = 4
  ) then raise exception 'admin_required' using errcode = '42501'; end if;

  select * into v_target from public.chat_profiles where id = p_profile_id for update;
  if not found or v_target.deleted_at is not null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if v_target.is_admin then raise exception 'cannot_delete_admin' using errcode = '42501'; end if;
  v_auth_user_id := v_target.auth_user_id;

  update public.chat_sessions set revoked_at = coalesce(revoked_at, now()) where profile_id = p_profile_id;
  update public.chat_devices set revoked_at = coalesce(revoked_at, now()) where profile_id = p_profile_id;
  delete from public.chat_profile_aliases where profile_id = p_profile_id;

  update public.chat_profiles
  set auth_user_id = null, username = null, guest_token = null, deleted_at = now(), updated_at = now()
  where id = p_profile_id;

  if v_auth_user_id is not null then
    delete from auth.users where id = v_auth_user_id;
  end if;
end;
$function$;

create or replace function public.chat_admin_support_inbox(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'chat_private'
as $function$
declare
  v_me uuid := public.chat_current_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  v_result jsonb;
begin
  if v_me is null then raise exception 'session_revoked'; end if;
  if not exists (select 1 from public.chat_profiles where id = v_me and is_admin = true) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_message_at desc nulls last, x.customer_last_seen_at desc nulls last), '[]'::jsonb)
  into v_result
  from (
    select c.id as conversation_id, peer.id as profile_id, peer.display_name, peer.username,
      peer.user_level, peer.identity_type, peer.address, peer.last_seen_at as customer_last_seen_at,
      c.last_message_at, lm.text as last_message_text, lm.type as last_message_type,
      (select count(*)::integer from public.chat_messages um
       where um.conversation_id = c.id and um.sender_id <> v_me and um.revoked_at is null
         and um.created_at > coalesce(am.last_read_at, '-infinity'::timestamptz)) as unread_count
    from public.chat_conversations c
    join public.chat_conversation_members am on am.conversation_id = c.id and am.profile_id = v_me and am.left_at is null
    join public.chat_conversation_members pm on pm.conversation_id = c.id and pm.profile_id <> v_me and pm.left_at is null
    join public.chat_profiles peer on peer.id = pm.profile_id and peer.is_admin = false and peer.deleted_at is null
    left join public.chat_messages lm on lm.id = c.last_message_id
    where c.type = 'direct'
    order by c.last_message_at desc nulls last, peer.last_seen_at desc nulls last
    limit v_limit
  ) x;
  return v_result;
end;
$function$;

create or replace function public.chat_admin_support_detail(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'chat_private'
as $function$
declare
  v_me uuid := public.chat_current_profile_id();
  v_peer uuid;
  v_result jsonb;
begin
  if v_me is null then raise exception 'session_revoked'; end if;
  if not exists (select 1 from public.chat_profiles where id = v_me and is_admin = true) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select pm.profile_id into v_peer
  from public.chat_conversations c
  join public.chat_conversation_members am on am.conversation_id = c.id and am.profile_id = v_me and am.left_at is null
  join public.chat_conversation_members pm on pm.conversation_id = c.id and pm.profile_id <> v_me and pm.left_at is null
  join public.chat_profiles peer on peer.id = pm.profile_id and peer.is_admin = false and peer.deleted_at is null
  where c.id = p_conversation_id and c.type = 'direct'
  limit 1;
  if v_peer is null then raise exception 'support_conversation_not_found' using errcode = 'P0002'; end if;

  select jsonb_build_object(
    'conversation_id', p_conversation_id, 'profile_id', p.id, 'display_name', p.display_name,
    'username', p.username, 'user_level', p.user_level, 'identity_type', p.identity_type,
    'address', p.address, 'customer_last_seen_at', p.last_seen_at,
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'platform',d.platform,'first_seen_at',d.first_seen_at,'last_seen_at',d.last_seen_at,'revoked_at',d.revoked_at) order by d.last_seen_at desc nulls last) from public.chat_devices d where d.profile_id=p.id), '[]'::jsonb),
    'member', coalesce((select jsonb_build_object('last_read_message_id',m.last_read_message_id,'last_read_at',m.last_read_at,'is_pinned',m.is_pinned,'is_favorite',m.is_favorite,'is_muted',m.is_muted) from public.chat_conversation_members m where m.conversation_id=p_conversation_id and m.profile_id=v_me limit 1), '{}'::jsonb)
  ) into v_result
  from public.chat_profiles p where p.id = v_peer;
  return v_result;
end;
$function$;

revoke all on function public.chat_admin_upgrade_guest(uuid,text,text,text) from public;
revoke all on function public.chat_admin_update_user2(uuid,text,text) from public;
revoke all on function public.chat_admin_reset_user2_password(uuid,text) from public;
revoke all on function public.chat_admin_soft_delete_user(uuid) from public;
grant execute on function public.chat_admin_upgrade_guest(uuid,text,text,text) to authenticated;
grant execute on function public.chat_admin_update_user2(uuid,text,text) to authenticated;
grant execute on function public.chat_admin_reset_user2_password(uuid,text) to authenticated;
grant execute on function public.chat_admin_soft_delete_user(uuid) to authenticated;
