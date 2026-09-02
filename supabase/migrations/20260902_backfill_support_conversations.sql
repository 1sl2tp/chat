do $block$
declare
  v_admin uuid;
  v_user record;
begin
  select id into v_admin
  from public.chat_profiles
  where is_admin = true
    and user_level = 4
    and deleted_at is null
  order by created_at
  limit 1;

  if v_admin is null then
    raise exception 'admin_required';
  end if;

  for v_user in
    select p.id
    from public.chat_profiles p
    where p.is_admin = false
      and p.deleted_at is null
      and not exists (
        select 1
        from public.chat_conversation_members am
        join public.chat_conversations c
          on c.id = am.conversation_id
         and c.type = 'direct'
        join public.chat_conversation_members um
          on um.conversation_id = c.id
         and um.profile_id = p.id
         and um.left_at is null
        where am.profile_id = v_admin
          and am.left_at is null
      )
  loop
    perform public.chat_admin_ensure_support_conversation(v_admin, v_user.id);
  end loop;
end;
$block$;
