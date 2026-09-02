revoke all on function public.chat_admin_upgrade_guest(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.chat_admin_update_user2(uuid,text,text) from public, anon, authenticated;
revoke all on function public.chat_admin_reset_user2_password(uuid,text) from public, anon, authenticated;
revoke all on function public.chat_admin_soft_delete_user(uuid) from public, anon, authenticated;

drop function public.chat_admin_upgrade_guest(uuid,text,text,text);
drop function public.chat_admin_update_user2(uuid,text,text);
drop function public.chat_admin_reset_user2_password(uuid,text);
drop function public.chat_admin_soft_delete_user(uuid);

create or replace function public.chat_admin_upgrade_guest(
  p_admin_profile_id uuid,
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
  v_display text := btrim(coalesce(p_display_name, ''));
  v_username text := lower(trim(leading '@' from btrim(coalesce(p_username, ''))));
  v_password text := coalesce(p_password, '');
  v_email text;
  v_target public.chat_profiles;
begin
  if not exists (select 1 from public.chat_profiles where id=p_admin_profile_id and is_admin=true and user_level=4 and deleted_at is null) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if char_length(v_display)<1 or char_length(v_display)>50 then raise exception 'invalid_display_name'; end if;
  if v_username='admin' then raise exception 'reserved_username'; end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'invalid_username'; end if;
  if char_length(v_password)<6 or char_length(v_password)>128 then raise exception 'invalid_password'; end if;

  select * into v_target from public.chat_profiles where id=p_profile_id for update;
  if not found or v_target.deleted_at is not null then raise exception 'user_not_found' using errcode='P0002'; end if;
  if v_target.is_admin or v_target.user_level<>1 or v_target.auth_user_id is null then raise exception 'guest_required'; end if;
  if exists (select 1 from public.chat_profiles where id<>p_profile_id and deleted_at is null and lower(username)=v_username) then raise exception 'username_taken'; end if;
  if exists (select 1 from public.chat_profile_aliases where username=v_username and profile_id<>p_profile_id and reserved_until>now()) then raise exception 'username_reserved'; end if;

  v_email := v_username || '@taphoa.chat';
  if exists (select 1 from auth.users where id<>v_target.auth_user_id and lower(email)=v_email) then raise exception 'username_taken'; end if;

  update auth.users
  set email=v_email,
      encrypted_password=extensions.crypt(v_password, extensions.gen_salt('bf')),
      email_confirmed_at=coalesce(email_confirmed_at,now()),
      raw_app_meta_data='{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('username',v_username,'display_name',v_display),
      is_anonymous=false,
      updated_at=now()
  where id=v_target.auth_user_id;

  insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
  values (v_target.auth_user_id::text,v_target.auth_user_id,jsonb_build_object('sub',v_target.auth_user_id::text,'email',v_email,'email_verified',true,'phone_verified',false),'email',now(),now(),now())
  on conflict (provider_id,provider) do update set identity_data=excluded.identity_data,updated_at=now();

  update public.chat_profiles
  set identity_type='taphoa',display_name=v_display,username=v_username,user_level=2,guest_token=null,updated_at=now()
  where id=p_profile_id;
  update public.chat_sessions set is_anonymous=false where profile_id=p_profile_id and revoked_at is null;

  return jsonb_build_object('profile_id',p_profile_id,'display_name',v_display,'username',v_username,'user_level',2);
end;
$function$;

create or replace function public.chat_admin_update_user2(
  p_admin_profile_id uuid,
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
  v_display text := btrim(coalesce(p_display_name,''));
  v_username text := lower(trim(leading '@' from btrim(coalesce(p_username,''))));
  v_email text;
  v_target public.chat_profiles;
  v_hold_days integer := chat_private.config_int('username_hold_days',30);
begin
  if not exists (select 1 from public.chat_profiles where id=p_admin_profile_id and is_admin=true and user_level=4 and deleted_at is null) then raise exception 'admin_required' using errcode='42501'; end if;
  if char_length(v_display)<1 or char_length(v_display)>50 then raise exception 'invalid_display_name'; end if;
  if v_username='admin' then raise exception 'reserved_username'; end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'invalid_username'; end if;

  select * into v_target from public.chat_profiles where id=p_profile_id for update;
  if not found or v_target.deleted_at is not null then raise exception 'user_not_found' using errcode='P0002'; end if;
  if v_target.is_admin or v_target.user_level<>2 or v_target.auth_user_id is null then raise exception 'user2_required'; end if;
  delete from public.chat_profile_aliases where reserved_until<=now();
  if exists (select 1 from public.chat_profiles where id<>p_profile_id and deleted_at is null and lower(username)=v_username) then raise exception 'username_taken'; end if;
  if exists (select 1 from public.chat_profile_aliases where username=v_username and profile_id<>p_profile_id and reserved_until>now()) then raise exception 'username_reserved'; end if;

  v_email := v_username || '@taphoa.chat';
  if exists (select 1 from auth.users where id<>v_target.auth_user_id and lower(email)=v_email) then raise exception 'username_taken'; end if;
  if v_target.username is not null and lower(v_target.username) is distinct from v_username then
    insert into public.chat_profile_aliases(username,profile_id,reserved_until)
    values(lower(v_target.username),p_profile_id,now()+make_interval(days=>v_hold_days))
    on conflict(username) do update set reserved_until=excluded.reserved_until where public.chat_profile_aliases.profile_id=excluded.profile_id;
  end if;
  delete from public.chat_profile_aliases where username=v_username and profile_id=p_profile_id;

  update public.chat_profiles set display_name=v_display,username=v_username,updated_at=now() where id=p_profile_id;
  update auth.users set email=v_email,raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('username',v_username,'display_name',v_display),updated_at=now() where id=v_target.auth_user_id;
  update auth.identities set identity_data=coalesce(identity_data,'{}'::jsonb)||jsonb_build_object('email',v_email,'email_verified',true),updated_at=now() where user_id=v_target.auth_user_id and provider='email';

  return jsonb_build_object('profile_id',p_profile_id,'display_name',v_display,'username',v_username,'user_level',2);
end;
$function$;

create or replace function public.chat_admin_reset_user2_password(
  p_admin_profile_id uuid,
  p_profile_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = 'public', 'auth', 'extensions'
as $function$
declare
  v_target public.chat_profiles;
  v_password text := coalesce(p_password,'');
begin
  if not exists (select 1 from public.chat_profiles where id=p_admin_profile_id and is_admin=true and user_level=4 and deleted_at is null) then raise exception 'admin_required' using errcode='42501'; end if;
  if char_length(v_password)<6 or char_length(v_password)>128 then raise exception 'invalid_password'; end if;
  select * into v_target from public.chat_profiles where id=p_profile_id for update;
  if not found or v_target.deleted_at is not null then raise exception 'user_not_found' using errcode='P0002'; end if;
  if v_target.is_admin or v_target.user_level<>2 or v_target.auth_user_id is null then raise exception 'user2_required'; end if;
  update auth.users set encrypted_password=extensions.crypt(v_password,extensions.gen_salt('bf')),updated_at=now() where id=v_target.auth_user_id;
end;
$function$;

create or replace function public.chat_admin_soft_delete_user(
  p_admin_profile_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = 'public', 'auth'
as $function$
declare
  v_target public.chat_profiles;
  v_auth_user_id uuid;
begin
  if not exists (select 1 from public.chat_profiles where id=p_admin_profile_id and is_admin=true and user_level=4 and deleted_at is null) then raise exception 'admin_required' using errcode='42501'; end if;
  select * into v_target from public.chat_profiles where id=p_profile_id for update;
  if not found or v_target.deleted_at is not null then raise exception 'user_not_found' using errcode='P0002'; end if;
  if v_target.is_admin then raise exception 'cannot_delete_admin' using errcode='42501'; end if;
  v_auth_user_id := v_target.auth_user_id;
  update public.chat_sessions set revoked_at=coalesce(revoked_at,now()) where profile_id=p_profile_id;
  update public.chat_devices set revoked_at=coalesce(revoked_at,now()) where profile_id=p_profile_id;
  delete from public.chat_profile_aliases where profile_id=p_profile_id;
  update public.chat_profiles set auth_user_id=null,username=null,guest_token=null,deleted_at=now(),updated_at=now() where id=p_profile_id;
  if v_auth_user_id is not null then delete from auth.users where id=v_auth_user_id; end if;
end;
$function$;

revoke all on function public.chat_admin_upgrade_guest(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.chat_admin_update_user2(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.chat_admin_reset_user2_password(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.chat_admin_soft_delete_user(uuid,uuid) from public, anon, authenticated;
grant execute on function public.chat_admin_upgrade_guest(uuid,uuid,text,text,text) to service_role;
grant execute on function public.chat_admin_update_user2(uuid,uuid,text,text) to service_role;
grant execute on function public.chat_admin_reset_user2_password(uuid,uuid,text) to service_role;
grant execute on function public.chat_admin_soft_delete_user(uuid,uuid) to service_role;
