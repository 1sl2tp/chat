create or replace function public.v21_message_forward_source(
  p_app_session_id uuid,
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $function$
declare
  v_me uuid := v21_private.require_active_account(p_app_session_id);
  v_message public.v21_messages%rowtype;
  v_media jsonb := '[]'::jsonb;
begin
  select m.* into v_message
  from public.v21_messages m
  join public.v21_conversations c on c.id=m.conversation_id
  where m.id=p_message_id
    and m.deleted_at is null
    and v_me in (c.member_a,c.member_b)
  limit 1;

  if v_message.id is null then
    raise exception 'message_not_found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',a.id,
        'conversation_id',a.conversation_id,
        'message_id',a.message_id,
        'owner_account_id',a.owner_account_id,
        'kind',a.kind,
        'file_name',a.file_name,
        'mime_type',a.mime_type,
        'size_bytes',a.size_bytes,
        'duration_ms',a.duration_ms,
        'storage_key',a.storage_key,
        'content_hash',a.content_hash,
        'width_px',a.width_px,
        'height_px',a.height_px,
        'sort_index',a.sort_index,
        'created_at',a.created_at,
        'updated_at',a.updated_at,
        'deleted_at',a.deleted_at,
        'version',a.version
      )
      order by a.sort_index,a.created_at,a.id
    ),
    '[]'::jsonb
  )
  into v_media
  from public.v21_media_assets a
  where a.message_id=v_message.id
    and a.deleted_at is null;

  return jsonb_build_object(
    'message',jsonb_build_object(
      'id',v_message.id,
      'conversation_id',v_message.conversation_id,
      'sender_account_id',v_message.sender_account_id,
      'client_id',v_message.client_id,
      'body',v_message.body,
      'created_at',v_message.created_at,
      'updated_at',v_message.updated_at,
      'version',v_message.version
    ),
    'media',v_media
  );
end;
$function$;

revoke all on function public.v21_message_forward_source(uuid,uuid) from public;
revoke all on function public.v21_message_forward_source(uuid,uuid) from anon;
grant execute on function public.v21_message_forward_source(uuid,uuid) to authenticated;
