-- V21.73.1 Zalo media bridge
-- Keep v21_messages + v21_media_assets canonical. Zalo is transport only.

create or replace function public.v21_zalo_media_target(
  p_zalo_id text,
  p_zalo_message_id text,
  p_event_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_zalo_id text := btrim(coalesce(p_zalo_id,''));
  v_external_id text := btrim(coalesce(p_zalo_message_id,''));
  v_event_at timestamptz := coalesce(p_event_at,now());
  v_link public.zalo_user_links%rowtype;
  v_member_a uuid;
  v_member_b uuid;
  v_conversation_id uuid;
  v_existing_message_id uuid;
begin
  if v_zalo_id='' or v_external_id='' then return null; end if;

  select * into v_link
  from public.zalo_user_links
  where zalo_id=v_zalo_id;

  if v_link.chat_account_id is null or v_event_at < v_link.linked_at then return null; end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=v_link.chat_account_id and a.role='user' and a.deleted_at is null
  ) or not exists(
    select 1 from public.v21_accounts a
    where a.id=v_link.linked_by_account_id and a.role='admin' and a.deleted_at is null
  ) then return null; end if;

  select z.chat_message_id into v_existing_message_id
  from public.zalo_message_links z
  where z.direction='inbound'
    and z.zalo_message_id=v_external_id
    and z.zalo_id=v_zalo_id
  limit 1;

  if v_existing_message_id is not null then
    select m.conversation_id into v_conversation_id
    from public.v21_messages m where m.id=v_existing_message_id;
    return jsonb_build_object(
      'chat_account_id',v_link.chat_account_id,
      'admin_account_id',v_link.linked_by_account_id,
      'conversation_id',v_conversation_id,
      'message_id',v_existing_message_id,
      'existing',true
    );
  end if;

  if v_link.linked_by_account_id::text < v_link.chat_account_id::text then
    v_member_a:=v_link.linked_by_account_id; v_member_b:=v_link.chat_account_id;
  else
    v_member_a:=v_link.chat_account_id; v_member_b:=v_link.linked_by_account_id;
  end if;

  insert into public.v21_conversations(member_a,member_b)
  values(v_member_a,v_member_b)
  on conflict(member_a,member_b) do update set member_a=excluded.member_a
  returning id into v_conversation_id;

  return jsonb_build_object(
    'chat_account_id',v_link.chat_account_id,
    'admin_account_id',v_link.linked_by_account_id,
    'conversation_id',v_conversation_id,
    'message_id',null,
    'existing',false
  );
end;
$$;

create or replace function public.v21_zalo_ingress_media(
  p_zalo_id text,
  p_zalo_message_id text,
  p_body text,
  p_event_at timestamptz,
  p_asset_id uuid,
  p_kind text,
  p_storage_key text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width_px integer default null,
  p_height_px integer default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_zalo_id text := btrim(coalesce(p_zalo_id,''));
  v_external_id text := btrim(coalesce(p_zalo_message_id,''));
  v_body text := btrim(coalesce(p_body,''));
  v_event_at timestamptz := coalesce(p_event_at,now());
  v_kind text := lower(btrim(coalesce(p_kind,'')));
  v_mime text := lower(btrim(coalesce(p_mime_type,'')));
  v_storage_key text := btrim(coalesce(p_storage_key,''));
  v_target jsonb;
  v_account_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_client_id text;
  v_existing_asset_id uuid;
begin
  if v_zalo_id='' or v_external_id='' or p_asset_id is null or v_storage_key='' then return null; end if;
  if char_length(v_body)>8000 or v_kind not in ('image','file') or v_mime='' then return null; end if;
  if coalesce(p_size_bytes,0)<1 or p_size_bytes>15728640 then return null; end if;
  if v_kind='image' and v_mime not like 'image/%' then return null; end if;
  if v_kind='file' and (nullif(btrim(coalesce(p_file_name,'')),'') is null or v_mime like 'image/%' or v_mime like 'audio/%') then return null; end if;

  v_target:=public.v21_zalo_media_target(v_zalo_id,v_external_id,v_event_at);
  if v_target is null then return null; end if;
  v_account_id:=(v_target->>'chat_account_id')::uuid;
  v_conversation_id:=(v_target->>'conversation_id')::uuid;

  if coalesce((v_target->>'existing')::boolean,false) then
    v_message_id:=(v_target->>'message_id')::uuid;
    select a.id into v_existing_asset_id
    from public.v21_media_assets a
    where a.message_id=v_message_id and a.deleted_at is null
    order by a.sort_index,a.created_at,a.id
    limit 1;
    return jsonb_build_object('message_id',v_message_id,'asset_id',v_existing_asset_id,'conversation_id',v_conversation_id,'idempotent_reuse',true);
  end if;

  v_client_id := 'zalo:' || left(v_zalo_id,40) || ':' || left(v_external_id,72);
  insert into public.v21_messages(conversation_id,sender_account_id,client_id,body,created_at)
  values(v_conversation_id,v_account_id,v_client_id,v_body,v_event_at)
  on conflict on constraint v21_messages_sender_account_id_client_id_key do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id into v_message_id
    from public.v21_messages m
    where m.sender_account_id=v_account_id and m.client_id=v_client_id
    limit 1;
  end if;
  if v_message_id is null then return null; end if;

  insert into public.v21_media_assets(
    id,conversation_id,message_id,owner_account_id,kind,file_name,mime_type,size_bytes,
    storage_key,width_px,height_px,sort_index,created_at
  ) values(
    p_asset_id,v_conversation_id,v_message_id,v_account_id,v_kind,
    case when v_kind='file' then left(btrim(p_file_name),255) else null end,
    v_mime,p_size_bytes,v_storage_key,
    case when v_kind='image' then p_width_px else null end,
    case when v_kind='image' then p_height_px else null end,
    0,v_event_at
  ) on conflict(id) do nothing;

  insert into public.zalo_message_links(
    chat_message_id,zalo_message_id,chat_account_id,zalo_id,direction,state,attempt_count,created_at,updated_at
  ) values(
    v_message_id,v_external_id,v_account_id,v_zalo_id,'inbound','received',0,now(),now()
  )
  on conflict(zalo_message_id)
    where direction='inbound' and zalo_message_id is not null
  do nothing;

  return jsonb_build_object('message_id',v_message_id,'asset_id',p_asset_id,'conversation_id',v_conversation_id,'idempotent_reuse',false);
end;
$$;

create or replace function v21_private.enqueue_zalo_media_outbound()
returns trigger
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_message public.v21_messages%rowtype;
  v_sender_role text;
  v_peer uuid;
  v_peer_role text;
  v_link public.zalo_user_links%rowtype;
begin
  if new.deleted_at is not null or new.message_id is null then return new; end if;

  select * into v_message from public.v21_messages m where m.id=new.message_id and m.deleted_at is null;
  if v_message.id is null or btrim(coalesce(v_message.body,''))<>'' then return new; end if;

  select a.role into v_sender_role from public.v21_accounts a
  where a.id=v_message.sender_account_id and a.deleted_at is null;
  if v_sender_role<>'admin' then return new; end if;

  select case when c.member_a=v_message.sender_account_id then c.member_b else c.member_a end
  into v_peer
  from public.v21_conversations c
  where c.id=v_message.conversation_id and v_message.sender_account_id in(c.member_a,c.member_b);
  if v_peer is null then return new; end if;

  select a.role into v_peer_role from public.v21_accounts a
  where a.id=v_peer and a.deleted_at is null;
  if v_peer_role<>'user' then return new; end if;

  select * into v_link from public.zalo_user_links l
  where l.chat_account_id=v_peer and l.linked_by_account_id=v_message.sender_account_id;
  if v_link.chat_account_id is null or v_message.created_at<v_link.linked_at then return new; end if;

  insert into public.zalo_message_links(
    chat_message_id,chat_account_id,zalo_id,direction,state,attempt_count,created_at,updated_at
  ) values(
    v_message.id,v_peer,v_link.zalo_id,'outbound','pending',0,now(),now()
  )
  on conflict(chat_message_id)
    where direction='outbound' and chat_message_id is not null
  do nothing;
  return new;
end;
$$;

drop trigger if exists v21_media_assets_enqueue_zalo_outbound_trg on public.v21_media_assets;
create trigger v21_media_assets_enqueue_zalo_outbound_trg
after insert on public.v21_media_assets
for each row execute function v21_private.enqueue_zalo_media_outbound();

create or replace function public.v21_zalo_outbound_due_media(
  p_limit integer default 20
) returns table(
  delivery_id uuid,
  chat_message_id uuid,
  chat_account_id uuid,
  zalo_id text,
  body text,
  attempt_count integer,
  media jsonb
)
language sql
security definer
set search_path to 'public','v21_private','auth'
as $$
  select
    d.id,d.chat_message_id,d.chat_account_id,d.zalo_id,m.body,d.attempt_count,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'asset_id',a.id,
        'kind',a.kind,
        'storage_key',a.storage_key,
        'file_name',a.file_name,
        'mime_type',a.mime_type,
        'size_bytes',a.size_bytes,
        'width_px',a.width_px,
        'height_px',a.height_px,
        'sort_index',a.sort_index
      ) order by a.sort_index,a.created_at,a.id)
      from public.v21_media_assets a
      where a.message_id=m.id and a.deleted_at is null and a.storage_key is not null
    ),'[]'::jsonb) as media
  from public.zalo_message_links d
  join public.v21_messages m on m.id=d.chat_message_id and m.deleted_at is null
  join public.zalo_user_links l
    on l.chat_account_id=d.chat_account_id
   and l.zalo_id=d.zalo_id
   and m.created_at>=l.linked_at
  where d.direction='outbound'
    and (
      d.state='pending'
      or (
        d.state='failed' and d.attempt_count<5
        and d.updated_at<=now()-make_interval(secs=>least(300,5*power(2,d.attempt_count)::integer))
      )
    )
  order by d.created_at,d.id
  limit greatest(1,least(coalesce(p_limit,20),100));
$$;

revoke all on function public.v21_zalo_media_target(text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.v21_zalo_ingress_media(text,text,text,timestamptz,uuid,text,text,text,text,bigint,integer,integer) from public,anon,authenticated;
revoke all on function public.v21_zalo_outbound_due_media(integer) from public,anon,authenticated;

grant execute on function public.v21_zalo_media_target(text,text,timestamptz) to service_role;
grant execute on function public.v21_zalo_ingress_media(text,text,text,timestamptz,uuid,text,text,text,text,bigint,integer,integer) to service_role;
grant execute on function public.v21_zalo_outbound_due_media(integer) to service_role;
