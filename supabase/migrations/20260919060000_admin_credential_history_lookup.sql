create or replace function public.v21_admin_last_credential_message(
  p_app_session_id uuid,
  p_contact_id uuid
)
returns text
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $function$
declare
  v_me uuid := v21_private.require_active_account(p_app_session_id);
  v_role text;
  v_conversation uuid;
  v_body text;
begin
  select a.role
  into v_role
  from public.v21_accounts a
  where a.id=v_me and a.deleted_at is null;

  if coalesce(v_role,'') <> 'admin' then
    raise exception 'admin_required';
  end if;

  if not exists(
    select 1
    from public.v21_accounts a
    where a.id=p_contact_id
      and a.role='user'
      and a.deleted_at is null
  ) then
    raise exception 'user_not_found';
  end if;

  select c.id
  into v_conversation
  from public.v21_conversations c
  where (c.member_a=v_me and c.member_b=p_contact_id)
     or (c.member_b=v_me and c.member_a=p_contact_id)
  order by c.created_at desc,c.id desc
  limit 1;

  if v_conversation is null then
    return null;
  end if;

  select m.body
  into v_body
  from public.v21_messages m
  where m.conversation_id=v_conversation
    and m.sender_account_id=v_me
    and m.deleted_at is null
    and m.body ilike 'Thông tin đăng nhập TAPHOA%'
    and m.body ilike '%Mật khẩu:%'
  order by m.created_at desc,m.id desc
  limit 1;

  return v_body;
end;
$function$;

revoke all on function public.v21_admin_last_credential_message(uuid,uuid) from public;
grant execute on function public.v21_admin_last_credential_message(uuid,uuid) to authenticated;
