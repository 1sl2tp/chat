create or replace function public.chat_resolve_identity()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile public.chat_profiles%rowtype;
  v_kind text;
begin
  if v_auth_user_id is null then
    raise exception 'session_required' using errcode = '42501';
  end if;

  select *
  into v_profile
  from public.chat_profiles
  where auth_user_id = v_auth_user_id
  order by is_admin desc, created_at asc
  limit 1;

  if not found then
    raise exception 'identity_unresolved' using errcode = 'P0001';
  end if;

  if coalesce(v_profile.is_admin, false) then
    v_kind := 'admin';
  elsif v_profile.identity_type = 'guest' then
    v_kind := 'guest_customer';
  else
    v_kind := 'registered_customer';
  end if;

  return jsonb_build_object(
    'kind', v_kind,
    'profile_id', v_profile.id,
    'auth_user_id', v_auth_user_id,
    'is_admin', coalesce(v_profile.is_admin, false)
  );
end;
$$;

revoke all on function public.chat_resolve_identity() from public;
grant execute on function public.chat_resolve_identity() to authenticated;
