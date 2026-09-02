create or replace function public.chat_update_user2_account(
  p_display_name text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'chat_private', 'auth'
as $function$
declare
  v_uid uuid := auth.uid();
  v_me uuid := public.chat_current_profile_id();
  v_display text := btrim(coalesce(p_display_name, ''));
  v_username text := lower(trim(leading '@' from btrim(coalesce(p_username, ''))));
  v_email text;
  v_profile public.chat_profiles;
  v_result jsonb;
begin
  if v_uid is null or v_me is null then
    raise exception 'session_revoked';
  end if;
  if char_length(v_display) < 1 or char_length(v_display) > 50 then
    raise exception 'invalid_display_name';
  end if;
  if v_username = 'admin' then
    raise exception 'reserved_username';
  end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'invalid_username';
  end if;

  select * into v_profile
  from public.chat_profiles
  where id = v_me
  for update;

  if not found then
    raise exception 'profile_required';
  end if;
  if v_profile.auth_user_id is distinct from v_uid then
    raise exception 'session_profile_mismatch';
  end if;
  if v_profile.is_admin or v_profile.user_level <> 2 then
    raise exception 'user2_required' using errcode = '42501';
  end if;

  v_email := v_username || '@taphoa.chat';
  if exists (
    select 1
    from auth.users
    where id <> v_uid
      and lower(email) = v_email
  ) then
    raise exception 'username_taken';
  end if;

  -- Reuse the canonical profile owner so username uniqueness/alias hold stays in one place.
  v_result := public.chat_update_my_profile(
    v_display,
    v_username,
    v_profile.avatar_url
  );

  update auth.users
  set email = v_email,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('username', v_username, 'display_name', v_display),
      updated_at = now()
  where id = v_uid;

  update auth.identities
  set identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object('email', v_email, 'email_verified', true),
      updated_at = now()
  where user_id = v_uid
    and provider = 'email';

  return jsonb_build_object(
    'id', v_me,
    'display_name', v_display,
    'username', v_username,
    'login_username', v_username
  );
end;
$function$;

revoke all on function public.chat_update_user2_account(text, text) from public;
grant execute on function public.chat_update_user2_account(text, text) to authenticated;
