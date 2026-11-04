-- CHAT-VN-SENDER-20261105
-- Display-only: prepend 'Bạn: ' to the last outgoing preview.
-- Keep the original timestamp/order, row types, SECURITY DEFINER, rights and read-only RPC.
-- CREATE OR REPLACE preserves the existing function identity and GRANTs.
CREATE OR REPLACE FUNCTION public.v21_contacts_sidebar(p_app_session_id uuid)
 RETURNS TABLE(id uuid, username text, display_name text, role text, avatar_path text, locked_at timestamp with time zone, version integer, updated_at timestamp with time zone, conversation_id uuid, preview_text text, preview_kind text, latest_at timestamp with time zone, has_unread boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth'
AS $function$
declare
  v_me uuid := v21_private.require_active_account(p_app_session_id);
  v_role text;
begin
  select a.role into v_role from public.v21_accounts a where a.id=v_me;

  return query
  select
    a.id,a.username,a.display_name,a.role,a.avatar_path,a.locked_at,a.version,a.updated_at,
    c.id as conversation_id,
    case
      when m.sender_account_id=v_me then 'Bạn: ' || (
        case
      when ma.kind='image' then 'Ảnh'
      when ma.kind='audio' then 'Ghi âm'
      when ma.kind='file' then 'Tệp'
      else nullif(regexp_replace(coalesce(m.body,''),'\s+',' ','g'),'')
    end
      )
      else (
        case
      when ma.kind='image' then 'Ảnh'
      when ma.kind='audio' then 'Ghi âm'
      when ma.kind='file' then 'Tệp'
      else nullif(regexp_replace(coalesce(m.body,''),'\s+',' ','g'),'')
    end
      )
    end as preview_text,
    coalesce(ma.kind,'text') as preview_kind,
    coalesce(ma.created_at,m.created_at) as latest_at,
    case when c.id is null then false else exists(
      select 1
      from public.v21_messages um
      left join public.v21_read_states rs
        on rs.conversation_id=c.id and rs.account_id=v_me
      where um.conversation_id=c.id
        and um.sender_account_id<>v_me
        and um.deleted_at is null
        and um.created_at>coalesce(rs.last_read_at,'epoch'::timestamptz)
    ) end as has_unread
  from public.v21_accounts a
  left join lateral (
    select vc.id
    from public.v21_conversations vc
    where v_me in (vc.member_a,vc.member_b)
      and a.id in (vc.member_a,vc.member_b)
    limit 1
  ) c on true
  left join lateral (
    select vm.*
    from public.v21_messages vm
    where vm.conversation_id=c.id and vm.deleted_at is null
    order by vm.created_at desc,vm.id desc
    limit 1
  ) m on true
  left join lateral (
    select vma.kind,vma.created_at
    from public.v21_media_assets vma
    where vma.conversation_id=c.id
      and vma.deleted_at is null
      and (m.id is null or vma.message_id=m.id)
    order by vma.created_at desc,vma.id desc
    limit 1
  ) ma on true
  where a.deleted_at is null
    and a.id<>v_me
    and (
      (v_role='admin' and a.role='user')
      or
      (v_role='user' and a.role='admin')
    )
  order by coalesce(coalesce(ma.created_at,m.created_at),a.created_at) desc,lower(a.display_name),lower(a.username);
end;
$function$;
