-- Add group endpoints to the existing Chat User <-> Zalo binding model.
alter table public.zalo_contacts
  add column if not exists thread_type text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.zalo_contacts'::regclass
      and conname='zalo_contacts_thread_type_check'
  ) then
    alter table public.zalo_contacts
      add constraint zalo_contacts_thread_type_check
      check (thread_type in ('user','group'));
  end if;
end
$$;

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
  select * into v_actor from public.v21_accounts
  where id=p_actor_account_id and deleted_at is null;
  if v_actor.id is null or v_actor.role <> 'admin' or v_actor.locked_at is not null then
    raise exception 'admin_required';
  end if;

  select * into v_target from public.v21_accounts
  where id=p_target_account_id and deleted_at is null;
  if v_target.id is null or v_target.role <> 'user' then
    raise exception 'user_not_found';
  end if;

  select jsonb_build_object(
    'chat_account_id',l.chat_account_id,'zalo_id',l.zalo_id,'linked_at',l.linked_at,
    'display_name',z.display_name,'avatar_url',z.avatar_url,'thread_type',z.thread_type
  ) into v_link
  from public.zalo_user_links l
  join public.zalo_contacts z on z.zalo_id=l.zalo_id
  where l.chat_account_id=p_target_account_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'zalo_id',z.zalo_id,'display_name',z.display_name,'avatar_url',z.avatar_url,
    'last_seen_at',z.last_seen_at,'thread_type',z.thread_type,
    'linked_chat_account_id',l.chat_account_id,'linked_to_target',(l.chat_account_id=p_target_account_id)
  ) order by lower(z.display_name),z.zalo_id),'[]'::jsonb)
  into v_contacts
  from public.zalo_contacts z
  left join public.zalo_user_links l on l.zalo_id=z.zalo_id;

  return jsonb_build_object(
    'target_account_id',p_target_account_id,'link',v_link,'contacts',v_contacts
  );
end;
$$;

drop function if exists public.v21_zalo_outbound_due_media(integer);

create function public.v21_zalo_outbound_due_media(p_limit integer default 20)
returns table(
  delivery_id uuid,chat_message_id uuid,chat_account_id uuid,zalo_id text,body text,
  attempt_count integer,thread_type text,media jsonb
)
language sql
security definer
set search_path to 'public','v21_private','auth'
as $$
  select
    d.id,d.chat_message_id,d.chat_account_id,d.zalo_id,m.body,d.attempt_count,z.thread_type,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'asset_id',a.id,'kind',a.kind,'storage_key',a.storage_key,'file_name',a.file_name,
        'mime_type',a.mime_type,'size_bytes',a.size_bytes,'width_px',a.width_px,
        'height_px',a.height_px,'sort_index',a.sort_index
      ) order by a.sort_index,a.created_at,a.id)
      from public.v21_media_assets a
      where a.message_id=m.id and a.deleted_at is null and a.storage_key is not null
        and a.kind in ('image','audio','file')
    ),'[]'::jsonb) as media
  from public.zalo_message_links d
  join public.v21_messages m on m.id=d.chat_message_id and m.deleted_at is null
  join public.zalo_user_links l
    on l.chat_account_id=d.chat_account_id and l.zalo_id=d.zalo_id and m.created_at>=l.linked_at
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
