-- Preserve both the original Zalo profile name and the user's local Zalo alias.
-- display_name remains the effective UI name for backward-compatible Chat clients.

alter table public.zalo_contacts
  add column if not exists profile_name text,
  add column if not exists alias_name text;

update public.zalo_contacts
set profile_name=display_name
where profile_name is null or btrim(profile_name)='';

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
    'chat_account_id',l.chat_account_id,
    'zalo_id',l.zalo_id,
    'linked_at',l.linked_at,
    'display_name',coalesce(nullif(btrim(z.alias_name),''),z.profile_name,z.display_name),
    'profile_name',z.profile_name,
    'alias_name',z.alias_name,
    'avatar_url',z.avatar_url
  )
  into v_link
  from public.zalo_user_links l
  join public.zalo_contacts z on z.zalo_id=l.zalo_id
  where l.chat_account_id=p_target_account_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'zalo_id',z.zalo_id,
    'display_name',coalesce(nullif(btrim(z.alias_name),''),z.profile_name,z.display_name),
    'profile_name',z.profile_name,
    'alias_name',z.alias_name,
    'avatar_url',z.avatar_url,
    'last_seen_at',z.last_seen_at,
    'thread_type',z.thread_type,
    'linked_chat_account_id',l.chat_account_id,
    'linked_to_target',(l.chat_account_id=p_target_account_id)
  ) order by lower(coalesce(nullif(btrim(z.alias_name),''),z.profile_name,z.display_name)),z.zalo_id),'[]'::jsonb)
  into v_contacts
  from public.zalo_contacts z
  left join public.zalo_user_links l on l.zalo_id=z.zalo_id;

  return jsonb_build_object(
    'target_account_id',p_target_account_id,
    'link',v_link,
    'contacts',v_contacts
  );
end;
$$;
