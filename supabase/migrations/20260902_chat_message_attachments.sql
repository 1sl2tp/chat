alter table public.chat_messages
  add column if not exists attachment jsonb;

create or replace function chat_private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
strict
set search_path = public, chat_private
as $$
begin
  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 20971520)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "chat attachments participants read" on storage.objects;
create policy "chat attachments participants read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-attachments'
  and chat_private.is_current_conversation_member(
    chat_private.try_uuid((storage.foldername(name))[1])
  )
);

drop policy if exists "chat attachments member insert" on storage.objects;
create policy "chat attachments member insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and chat_private.is_current_conversation_member(
    chat_private.try_uuid((storage.foldername(name))[1])
  )
  and (storage.foldername(name))[2] = public.chat_current_profile_id()::text
);

drop policy if exists "chat attachments owner delete" on storage.objects;
create policy "chat attachments owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[2] = public.chat_current_profile_id()::text
);

create or replace function public.chat_send_attachment_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_type text,
  p_attachment jsonb,
  p_text text default null
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public, chat_private
as $$
declare
  v_me uuid := public.chat_current_profile_id();
  v_peer uuid;
  v_conversation_type text;
  v_admin_bridge boolean := false;
  v_type text := lower(btrim(coalesce(p_type, '')));
  v_path text := btrim(coalesce(p_attachment->>'path', ''));
  v_name text := btrim(coalesce(p_attachment->>'name', ''));
  v_mime text := btrim(coalesce(p_attachment->>'mime', ''));
  v_kind text := lower(btrim(coalesce(p_attachment->>'kind', '')));
  v_size bigint;
  v_prefix text;
  v_result public.chat_messages;
begin
  if v_me is null then raise exception 'session_revoked'; end if;
  if p_client_message_id is null then raise exception 'client_message_id required'; end if;
  if v_type not in ('image', 'audio', 'file') then raise exception 'unsupported_attachment_type'; end if;
  if jsonb_typeof(p_attachment) <> 'object' then raise exception 'invalid_attachment'; end if;
  if v_kind <> v_type then raise exception 'attachment_kind_mismatch'; end if;
  if v_path = '' or v_name = '' or v_mime = '' then raise exception 'attachment_metadata_required'; end if;

  begin
    v_size := (p_attachment->>'size')::bigint;
  exception
    when others then raise exception 'invalid_attachment_size';
  end;

  if v_size <= 0 or v_size > 20971520 then raise exception 'invalid_attachment_size'; end if;
  if not chat_private.is_active_member(v_me, p_conversation_id) then raise exception 'not_member'; end if;

  select c.type into v_conversation_type
  from public.chat_conversations c
  where c.id = p_conversation_id;
  if not found then raise exception 'conversation not found'; end if;

  v_prefix := p_conversation_id::text || '/' || v_me::text || '/';
  if left(v_path, length(v_prefix)) <> v_prefix then raise exception 'attachment_path_owner_mismatch'; end if;

  if v_conversation_type = 'direct' then
    v_peer := chat_private.direct_peer(v_me, p_conversation_id);
    select exists(
      select 1
      from public.chat_profiles p
      where p.id in (v_me, v_peer)
        and p.is_admin = true
    ) into v_admin_bridge;

    if not v_admin_bridge then raise exception 'attachment_admin_bridge_required'; end if;
  else
    raise exception 'attachment_direct_conversation_required';
  end if;

  insert into public.chat_messages(
    conversation_id,
    sender_id,
    client_message_id,
    type,
    text,
    attachment
  )
  values(
    p_conversation_id,
    v_me,
    p_client_message_id,
    v_type,
    nullif(btrim(coalesce(p_text, '')), ''),
    p_attachment
  )
  on conflict (sender_id, client_message_id)
  do update set attachment = public.chat_messages.attachment
  returning * into v_result;

  if v_admin_bridge and v_peer is not null then
    perform chat_private.enqueue_notification('chat_message', v_result.id, v_peer);
  end if;

  return v_result;
end;
$$;

revoke all on function public.chat_send_attachment_message(uuid, uuid, text, jsonb, text) from public;
grant execute on function public.chat_send_attachment_message(uuid, uuid, text, jsonb, text) to authenticated;
