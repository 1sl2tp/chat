alter table public.zalo_message_links
  add column if not exists delivery_part text not null default 'message';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.zalo_message_links'::regclass
      and conname='zalo_message_links_delivery_part_check'
  ) then
    alter table public.zalo_message_links
      add constraint zalo_message_links_delivery_part_check
      check (delivery_part in ('message','text','media'));
  end if;
end $$;

drop index if exists public.zalo_message_links_outbound_uidx;
create unique index zalo_message_links_outbound_uidx
  on public.zalo_message_links(chat_message_id,delivery_part)
  where direction='outbound' and chat_message_id is not null;

create or replace function v21_private.enqueue_zalo_outbound()
returns trigger
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_sender_role text;
  v_peer uuid;
  v_peer_role text;
  v_link public.zalo_user_links%rowtype;
begin
  if new.deleted_at is not null or btrim(coalesce(new.body,''))='' then
    return new;
  end if;

  select a.role into v_sender_role
  from public.v21_accounts a
  where a.id=new.sender_account_id and a.deleted_at is null;
  if v_sender_role <> 'admin' then return new; end if;

  select case when c.member_a=new.sender_account_id then c.member_b else c.member_a end
  into v_peer
  from public.v21_conversations c
  where c.id=new.conversation_id and new.sender_account_id in (c.member_a,c.member_b);
  if v_peer is null then return new; end if;

  select a.role into v_peer_role
  from public.v21_accounts a
  where a.id=v_peer and a.deleted_at is null;
  if v_peer_role <> 'user' then return new; end if;

  select * into v_link
  from public.zalo_user_links l
  where l.chat_account_id=v_peer and l.linked_by_account_id=new.sender_account_id;
  if v_link.chat_account_id is null or new.created_at < v_link.linked_at then return new; end if;

  insert into public.zalo_message_links(
    chat_message_id,chat_account_id,zalo_id,direction,state,attempt_count,
    delivery_part,created_at,updated_at
  ) values(
    new.id,v_peer,v_link.zalo_id,'outbound','pending',0,
    'text',now(),now()
  )
  on conflict(chat_message_id,delivery_part)
    where direction='outbound' and chat_message_id is not null
  do nothing;

  return new;
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
  if new.deleted_at is not null or new.message_id is null
     or new.kind not in ('image','audio','file') then return new; end if;

  select * into v_message
  from public.v21_messages m
  where m.id=new.message_id and m.deleted_at is null;
  if v_message.id is null then return new; end if;

  select a.role into v_sender_role
  from public.v21_accounts a
  where a.id=v_message.sender_account_id and a.deleted_at is null;
  if v_sender_role <> 'admin' then return new; end if;

  select case when c.member_a=v_message.sender_account_id then c.member_b else c.member_a end
  into v_peer
  from public.v21_conversations c
  where c.id=v_message.conversation_id
    and v_message.sender_account_id in(c.member_a,c.member_b);
  if v_peer is null then return new; end if;

  select a.role into v_peer_role
  from public.v21_accounts a
  where a.id=v_peer and a.deleted_at is null;
  if v_peer_role <> 'user' then return new; end if;

  select * into v_link
  from public.zalo_user_links l
  where l.chat_account_id=v_peer and l.linked_by_account_id=v_message.sender_account_id;
  if v_link.chat_account_id is null or v_message.created_at<v_link.linked_at then return new; end if;

  insert into public.zalo_message_links(
    chat_message_id,chat_account_id,zalo_id,direction,state,attempt_count,
    delivery_part,created_at,updated_at
  ) values(
    v_message.id,v_peer,v_link.zalo_id,'outbound','pending',0,
    'media',now(),now()
  )
  on conflict(chat_message_id,delivery_part)
    where direction='outbound' and chat_message_id is not null
  do nothing;

  return new;
end;
$$;

create or replace function public.v21_zalo_outbound_due_media(
  p_limit integer default 20
) returns table(
  delivery_id uuid,
  chat_message_id uuid,
  chat_account_id uuid,
  zalo_id text,
  body text,
  attempt_count integer,
  thread_type text,
  media jsonb
)
language sql
security definer
set search_path to 'public','v21_private','auth'
as $$
  select
    d.id,d.chat_message_id,d.chat_account_id,d.zalo_id,
    case when d.delivery_part='media' then ''::text else m.body end,
    d.attempt_count,z.thread_type,
    case
      when d.delivery_part='text' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'asset_id',a.id,'kind',a.kind,'storage_key',a.storage_key,
          'file_name',a.file_name,'mime_type',a.mime_type,'size_bytes',a.size_bytes,
          'width_px',a.width_px,'height_px',a.height_px,'sort_index',a.sort_index
        ) order by a.sort_index,a.created_at,a.id)
        from public.v21_media_assets a
        where a.message_id=m.id and a.deleted_at is null and a.storage_key is not null
          and a.kind in ('image','audio','file')
      ),'[]'::jsonb)
    end
  from public.zalo_message_links d
  join public.v21_messages m on m.id=d.chat_message_id and m.deleted_at is null
  join public.zalo_user_links l
    on l.chat_account_id=d.chat_account_id and l.zalo_id=d.zalo_id
   and m.created_at>=l.linked_at
  join public.zalo_contacts z on z.zalo_id=d.zalo_id
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

revoke all on function public.v21_zalo_outbound_due_media(integer) from public,anon,authenticated;
grant execute on function public.v21_zalo_outbound_due_media(integer) to service_role;
