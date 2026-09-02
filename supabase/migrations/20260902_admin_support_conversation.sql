create or replace function public.chat_admin_ensure_support_conversation(
  p_admin_profile_id uuid,
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_key text;
  v_conversation_id uuid;
begin
  if not exists (
    select 1 from public.chat_profiles
    where id = p_admin_profile_id
      and is_admin = true
      and user_level = 4
      and deleted_at is null
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chat_profiles
    where id = p_profile_id
      and is_admin = false
      and deleted_at is null
  ) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  v_key := case
    when p_admin_profile_id::text < p_profile_id::text
      then p_admin_profile_id::text || ':' || p_profile_id::text
    else p_profile_id::text || ':' || p_admin_profile_id::text
  end;

  insert into public.chat_conversations(type, direct_key, created_by)
  values ('direct', v_key, p_admin_profile_id)
  on conflict (direct_key) where type = 'direct'
  do update set updated_at = public.chat_conversations.updated_at
  returning id into v_conversation_id;

  insert into public.chat_conversation_members(conversation_id, profile_id, role)
  values
    (v_conversation_id, p_admin_profile_id, 'member'),
    (v_conversation_id, p_profile_id, 'member')
  on conflict do nothing;

  return v_conversation_id;
end;
$function$;

revoke all on function public.chat_admin_ensure_support_conversation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.chat_admin_ensure_support_conversation(uuid,uuid) to service_role;
