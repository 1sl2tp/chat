alter table public.chat_profiles
  add column if not exists address text null;

create or replace function public.chat_update_my_profile(
  p_display_name text,
  p_username text,
  p_avatar_url text,
  p_address text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'chat_private'
as $function$
declare
  v_me uuid := public.chat_current_profile_id();
  v_current public.chat_profiles;
  v_result jsonb;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if v_me is null then raise exception 'session_revoked'; end if;
  if v_address is not null and char_length(v_address) > 500 then
    raise exception 'address too long';
  end if;

  select * into v_current
  from public.chat_profiles
  where id = v_me
  for update;
  if not found then raise exception 'profile required'; end if;

  v_result := public.chat_update_my_profile(
    p_display_name,
    coalesce(p_username, v_current.username),
    coalesce(p_avatar_url, v_current.avatar_url)
  );

  update public.chat_profiles
  set address = v_address,
      updated_at = now()
  where id = v_me
  returning jsonb_build_object(
    'id', id,
    'display_name', display_name,
    'username', username,
    'avatar_url', avatar_url,
    'address', address,
    'identity_type', identity_type
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.chat_admin_support_inbox(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'chat_private'
as $function$
declare
  v_me uuid := public.chat_current_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  v_result jsonb;
begin
  if v_me is null then raise exception 'session_revoked'; end if;
  if not exists (
    select 1 from public.chat_profiles
    where id = v_me and is_admin = true
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_message_at desc nulls last, x.customer_last_seen_at desc nulls last), '[]'::jsonb)
  into v_result
  from (
    select
      c.id as conversation_id,
      peer.id as profile_id,
      peer.display_name,
      peer.identity_type,
      peer.address,
      peer.last_seen_at as customer_last_seen_at,
      c.last_message_at,
      lm.text as last_message_text,
      lm.type as last_message_type,
      (
        select count(*)::integer
        from public.chat_messages um
        where um.conversation_id = c.id
          and um.sender_id <> v_me
          and um.revoked_at is null
          and um.created_at > coalesce(am.last_read_at, '-infinity'::timestamptz)
      ) as unread_count
    from public.chat_conversations c
    join public.chat_conversation_members am
      on am.conversation_id = c.id
     and am.profile_id = v_me
     and am.left_at is null
    join public.chat_conversation_members pm
      on pm.conversation_id = c.id
     and pm.profile_id <> v_me
     and pm.left_at is null
    join public.chat_profiles peer
      on peer.id = pm.profile_id
     and peer.is_admin = false
    left join public.chat_messages lm
      on lm.id = c.last_message_id
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
set search_path to 'public', 'chat_private'
as $function$
declare
  v_me uuid := public.chat_current_profile_id();
  v_peer uuid;
  v_result jsonb;
begin
  if v_me is null then raise exception 'session_revoked'; end if;
  if not exists (
    select 1 from public.chat_profiles
    where id = v_me and is_admin = true
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select pm.profile_id into v_peer
  from public.chat_conversations c
  join public.chat_conversation_members am
    on am.conversation_id = c.id
   and am.profile_id = v_me
   and am.left_at is null
  join public.chat_conversation_members pm
    on pm.conversation_id = c.id
   and pm.profile_id <> v_me
   and pm.left_at is null
  join public.chat_profiles peer
    on peer.id = pm.profile_id
   and peer.is_admin = false
  where c.id = p_conversation_id
    and c.type = 'direct'
  limit 1;

  if v_peer is null then
    raise exception 'support_conversation_not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'conversation_id', p_conversation_id,
    'profile_id', p.id,
    'display_name', p.display_name,
    'identity_type', p.identity_type,
    'address', p.address,
    'customer_last_seen_at', p.last_seen_at,
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'label', d.label,
        'platform', d.platform,
        'first_seen_at', d.first_seen_at,
        'last_seen_at', d.last_seen_at,
        'revoked_at', d.revoked_at
      ) order by d.last_seen_at desc nulls last)
      from public.chat_devices d
      where d.profile_id = p.id
    ), '[]'::jsonb),
    'member', coalesce((
      select jsonb_build_object(
        'last_read_message_id', m.last_read_message_id,
        'last_read_at', m.last_read_at,
        'is_pinned', m.is_pinned,
        'is_favorite', m.is_favorite,
        'is_muted', m.is_muted
      )
      from public.chat_conversation_members m
      where m.conversation_id = p_conversation_id
        and m.profile_id = v_me
      limit 1
    ), '{}'::jsonb)
  ) into v_result
  from public.chat_profiles p
  where p.id = v_peer;

  return v_result;
end;
$function$;

revoke all on function public.chat_admin_support_inbox(integer) from public, anon;
revoke all on function public.chat_admin_support_detail(uuid) from public, anon;
grant execute on function public.chat_admin_support_inbox(integer) to authenticated;
grant execute on function public.chat_admin_support_detail(uuid) to authenticated;
grant execute on function public.chat_update_my_profile(text,text,text,text) to authenticated;
