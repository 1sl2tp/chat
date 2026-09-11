-- V21.73.0 Zalo User Link Bridge
-- Additive only: existing Chat accounts/conversations/messages remain canonical.

create table if not exists public.zalo_contacts (
  zalo_id text primary key,
  display_name text not null,
  avatar_url text,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint zalo_contacts_id_nonempty check (btrim(zalo_id) <> ''),
  constraint zalo_contacts_display_name_nonempty check (btrim(display_name) <> '')
);

create table if not exists public.zalo_user_links (
  chat_account_id uuid primary key references public.v21_accounts(id) on delete cascade,
  zalo_id text not null unique references public.zalo_contacts(zalo_id) on delete cascade,
  linked_by_account_id uuid not null references public.v21_accounts(id),
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zalo_id)
);

create table if not exists public.zalo_message_links (
  id uuid primary key default gen_random_uuid(),
  chat_message_id uuid references public.v21_messages(id) on delete set null,
  zalo_message_id text,
  chat_account_id uuid not null references public.v21_accounts(id),
  zalo_id text not null,
  direction text not null check(direction in ('inbound','outbound')),
  state text not null check(state in ('pending','sent','failed','received')),
  attempt_count integer not null default 0 check(attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists zalo_message_links_outbound_uidx
  on public.zalo_message_links(chat_message_id)
  where direction='outbound' and chat_message_id is not null;

create unique index if not exists zalo_message_links_inbound_uidx
  on public.zalo_message_links(zalo_message_id)
  where direction='inbound' and zalo_message_id is not null;

create index if not exists zalo_message_links_due_idx
  on public.zalo_message_links(state, updated_at)
  where direction='outbound';

alter table public.zalo_contacts enable row level security;
alter table public.zalo_user_links enable row level security;
alter table public.zalo_message_links enable row level security;

revoke all on table public.zalo_contacts from public, anon, authenticated;
revoke all on table public.zalo_user_links from public, anon, authenticated;
revoke all on table public.zalo_message_links from public, anon, authenticated;

create or replace function public.v21_zalo_admin_snapshot(
  p_actor_account_id uuid,
  p_target_account_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_actor public.v21_accounts%rowtype;
  v_target public.v21_accounts%rowtype;
  v_link jsonb;
  v_contacts jsonb;
begin
  select * into v_actor
  from public.v21_accounts
  where id=p_actor_account_id and deleted_at is null;

  if v_actor.id is null or v_actor.role <> 'admin' or v_actor.locked_at is not null then
    raise exception 'admin_required';
  end if;

  select * into v_target
  from public.v21_accounts
  where id=p_target_account_id and deleted_at is null;

  if v_target.id is null or v_target.role <> 'user' then
    raise exception 'user_not_found';
  end if;

  select jsonb_build_object(
    'chat_account_id', l.chat_account_id,
    'zalo_id', l.zalo_id,
    'linked_at', l.linked_at,
    'display_name', z.display_name,
    'avatar_url', z.avatar_url
  )
  into v_link
  from public.zalo_user_links l
  join public.zalo_contacts z on z.zalo_id=l.zalo_id
  where l.chat_account_id=p_target_account_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'zalo_id', z.zalo_id,
    'display_name', z.display_name,
    'avatar_url', z.avatar_url,
    'last_seen_at', z.last_seen_at,
    'linked_chat_account_id', l.chat_account_id,
    'linked_to_target', (l.chat_account_id=p_target_account_id)
  ) order by lower(z.display_name), z.zalo_id), '[]'::jsonb)
  into v_contacts
  from public.zalo_contacts z
  left join public.zalo_user_links l on l.zalo_id=z.zalo_id;

  return jsonb_build_object(
    'target_account_id', p_target_account_id,
    'link', v_link,
    'contacts', v_contacts
  );
end;
$$;

create or replace function public.v21_zalo_admin_link(
  p_actor_account_id uuid,
  p_target_account_id uuid,
  p_zalo_id text
) returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_actor public.v21_accounts%rowtype;
  v_target public.v21_accounts%rowtype;
  v_contact public.zalo_contacts%rowtype;
  v_existing public.zalo_user_links%rowtype;
begin
  select * into v_actor
  from public.v21_accounts
  where id=p_actor_account_id and deleted_at is null;

  if v_actor.id is null or v_actor.role <> 'admin' or v_actor.locked_at is not null then
    raise exception 'admin_required';
  end if;

  select * into v_target
  from public.v21_accounts
  where id=p_target_account_id and deleted_at is null;

  if v_target.id is null or v_target.role <> 'user' then
    raise exception 'user_not_found';
  end if;

  select * into v_contact
  from public.zalo_contacts
  where zalo_id=btrim(coalesce(p_zalo_id,''));

  if v_contact.zalo_id is null then
    raise exception 'zalo_not_found';
  end if;

  select * into v_existing
  from public.zalo_user_links
  where chat_account_id=p_target_account_id;

  if v_existing.zalo_id=v_contact.zalo_id then
    return jsonb_build_object(
      'chat_account_id', p_target_account_id,
      'zalo_id', v_contact.zalo_id,
      'display_name', v_contact.display_name,
      'avatar_url', v_contact.avatar_url,
      'linked_at', v_existing.linked_at
    );
  end if;

  if exists(
    select 1 from public.zalo_user_links
    where zalo_id=v_contact.zalo_id
      and chat_account_id<>p_target_account_id
  ) then
    raise exception 'zalo_already_linked';
  end if;

  begin
    delete from public.zalo_user_links
    where chat_account_id=p_target_account_id;

    insert into public.zalo_user_links(
      chat_account_id,zalo_id,linked_by_account_id,linked_at,updated_at
    ) values(
      p_target_account_id,v_contact.zalo_id,p_actor_account_id,now(),now()
    );
  exception when unique_violation then
    raise exception 'zalo_already_linked';
  end;

  return jsonb_build_object(
    'chat_account_id', p_target_account_id,
    'zalo_id', v_contact.zalo_id,
    'display_name', v_contact.display_name,
    'avatar_url', v_contact.avatar_url,
    'linked_at', now()
  );
end;
$$;

create or replace function public.v21_zalo_admin_unlink(
  p_actor_account_id uuid,
  p_target_account_id uuid
) returns boolean
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_actor public.v21_accounts%rowtype;
  v_target public.v21_accounts%rowtype;
begin
  select * into v_actor
  from public.v21_accounts
  where id=p_actor_account_id and deleted_at is null;

  if v_actor.id is null or v_actor.role <> 'admin' or v_actor.locked_at is not null then
    raise exception 'admin_required';
  end if;

  select * into v_target
  from public.v21_accounts
  where id=p_target_account_id and deleted_at is null;

  if v_target.id is null or v_target.role <> 'user' then
    raise exception 'user_not_found';
  end if;

  delete from public.zalo_user_links
  where chat_account_id=p_target_account_id;

  return true;
end;
$$;

create or replace function public.v21_zalo_contact_upsert(
  p_zalo_id text,
  p_display_name text,
  p_avatar_url text default null,
  p_last_seen_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_zalo_id text := btrim(coalesce(p_zalo_id,''));
  v_name text := btrim(coalesce(p_display_name,''));
begin
  if v_zalo_id='' or v_name='' then
    raise exception 'invalid_zalo_contact';
  end if;

  insert into public.zalo_contacts(zalo_id,display_name,avatar_url,last_seen_at,updated_at)
  values(v_zalo_id,v_name,nullif(btrim(coalesce(p_avatar_url,'')),''),p_last_seen_at,now())
  on conflict(zalo_id) do update set
    display_name=excluded.display_name,
    avatar_url=coalesce(excluded.avatar_url,public.zalo_contacts.avatar_url),
    last_seen_at=coalesce(excluded.last_seen_at,public.zalo_contacts.last_seen_at),
    updated_at=now();
end;
$$;

create or replace function public.v21_zalo_ingress(
  p_zalo_id text,
  p_zalo_message_id text,
  p_body text,
  p_event_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_zalo_id text := btrim(coalesce(p_zalo_id,''));
  v_external_id text := btrim(coalesce(p_zalo_message_id,''));
  v_body text := btrim(coalesce(p_body,''));
  v_event_at timestamptz := coalesce(p_event_at,now());
  v_link public.zalo_user_links%rowtype;
  v_member_a uuid;
  v_member_b uuid;
  v_conversation_id uuid;
  v_client_id text;
  v_message_id uuid;
begin
  if v_zalo_id='' or v_external_id='' or v_body='' or char_length(v_body)>8000 then
    return null;
  end if;

  select * into v_link
  from public.zalo_user_links
  where zalo_id=v_zalo_id;

  if v_link.chat_account_id is null or v_event_at < v_link.linked_at then
    return null;
  end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=v_link.chat_account_id and a.role='user' and a.deleted_at is null
  ) or not exists(
    select 1 from public.v21_accounts a
    where a.id=v_link.linked_by_account_id and a.role='admin' and a.deleted_at is null
  ) then
    return null;
  end if;

  if v_link.linked_by_account_id::text < v_link.chat_account_id::text then
    v_member_a:=v_link.linked_by_account_id;
    v_member_b:=v_link.chat_account_id;
  else
    v_member_a:=v_link.chat_account_id;
    v_member_b:=v_link.linked_by_account_id;
  end if;

  insert into public.v21_conversations(member_a,member_b)
  values(v_member_a,v_member_b)
  on conflict(member_a,member_b)
  do update set member_a=excluded.member_a
  returning id into v_conversation_id;

  v_client_id := 'zalo:' || left(v_zalo_id,40) || ':' || left(v_external_id,72);

  insert into public.v21_messages(
    conversation_id,sender_account_id,client_id,body,created_at
  ) values(
    v_conversation_id,v_link.chat_account_id,v_client_id,v_body,v_event_at
  )
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id into v_message_id
    from public.v21_messages m
    where m.sender_account_id=v_link.chat_account_id
      and m.client_id=v_client_id
    limit 1;
  end if;

  insert into public.zalo_message_links(
    chat_message_id,zalo_message_id,chat_account_id,zalo_id,direction,state,attempt_count,created_at,updated_at
  ) values(
    v_message_id,v_external_id,v_link.chat_account_id,v_zalo_id,'inbound','received',0,now(),now()
  )
  on conflict(zalo_message_id)
    where direction='inbound' and zalo_message_id is not null
  do nothing;

  return v_message_id;
end;
$$;

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

  if v_sender_role <> 'admin' then
    return new;
  end if;

  select
    case when c.member_a=new.sender_account_id then c.member_b else c.member_a end
  into v_peer
  from public.v21_conversations c
  where c.id=new.conversation_id
    and new.sender_account_id in (c.member_a,c.member_b);

  if v_peer is null then
    return new;
  end if;

  select a.role into v_peer_role
  from public.v21_accounts a
  where a.id=v_peer and a.deleted_at is null;

  if v_peer_role <> 'user' then
    return new;
  end if;

  select * into v_link
  from public.zalo_user_links l
  where l.chat_account_id=v_peer
    and l.linked_by_account_id=new.sender_account_id;

  if v_link.chat_account_id is null or new.created_at < v_link.linked_at then
    return new;
  end if;

  insert into public.zalo_message_links(
    chat_message_id,chat_account_id,zalo_id,direction,state,attempt_count,created_at,updated_at
  ) values(
    new.id,v_peer,v_link.zalo_id,'outbound','pending',0,now(),now()
  )
  on conflict(chat_message_id)
    where direction='outbound' and chat_message_id is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists v21_messages_enqueue_zalo_outbound_trg on public.v21_messages;
create trigger v21_messages_enqueue_zalo_outbound_trg
after insert on public.v21_messages
for each row execute function v21_private.enqueue_zalo_outbound();

create or replace function public.v21_zalo_outbound_due(
  p_limit integer default 20
) returns table(
  delivery_id uuid,
  chat_message_id uuid,
  chat_account_id uuid,
  zalo_id text,
  body text,
  attempt_count integer
)
language sql
security definer
set search_path to 'public','v21_private','auth'
as $$
  select
    d.id as delivery_id,
    d.chat_message_id,
    d.chat_account_id,
    d.zalo_id,
    m.body,
    d.attempt_count
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
        d.state='failed'
        and d.attempt_count<5
        and d.updated_at <= now() - make_interval(secs => least(300, 5 * power(2,d.attempt_count)::integer))
      )
    )
  order by d.created_at,d.id
  limit greatest(1,least(coalesce(p_limit,20),100));
$$;

create or replace function public.v21_zalo_outbound_result(
  p_delivery_id uuid,
  p_ok boolean,
  p_zalo_message_id text default null,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
begin
  if p_delivery_id is null then
    return false;
  end if;

  if coalesce(p_ok,false) then
    update public.zalo_message_links
    set state='sent',
        zalo_message_id=nullif(btrim(coalesce(p_zalo_message_id,'')),''),
        attempt_count=attempt_count+1,
        last_error=null,
        updated_at=now()
    where id=p_delivery_id
      and direction='outbound'
      and state<>'sent';
  else
    update public.zalo_message_links
    set state='failed',
        attempt_count=attempt_count+1,
        last_error=left(coalesce(p_error,'zalo_send_failed'),500),
        updated_at=now()
    where id=p_delivery_id
      and direction='outbound'
      and state<>'sent';
  end if;

  return found;
end;
$$;

revoke all on function public.v21_zalo_admin_snapshot(uuid,uuid) from public, anon, authenticated;
revoke all on function public.v21_zalo_admin_link(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.v21_zalo_admin_unlink(uuid,uuid) from public, anon, authenticated;
revoke all on function public.v21_zalo_contact_upsert(text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.v21_zalo_ingress(text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.v21_zalo_outbound_due(integer) from public, anon, authenticated;
revoke all on function public.v21_zalo_outbound_result(uuid,boolean,text,text) from public, anon, authenticated;

grant execute on function public.v21_zalo_admin_snapshot(uuid,uuid) to service_role;
grant execute on function public.v21_zalo_admin_link(uuid,uuid,text) to service_role;
grant execute on function public.v21_zalo_admin_unlink(uuid,uuid) to service_role;
grant execute on function public.v21_zalo_contact_upsert(text,text,text,timestamptz) to service_role;
grant execute on function public.v21_zalo_ingress(text,text,text,timestamptz) to service_role;
grant execute on function public.v21_zalo_outbound_due(integer) to service_role;
grant execute on function public.v21_zalo_outbound_result(uuid,boolean,text,text) to service_role;
