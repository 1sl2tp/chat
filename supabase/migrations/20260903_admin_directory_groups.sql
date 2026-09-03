create table if not exists public.chat_admin_directory_groups (
  admin_profile_id uuid not null references public.chat_profiles(id) on delete cascade,
  group_id uuid not null default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (admin_profile_id, group_id)
);

create unique index if not exists chat_admin_directory_groups_admin_name_uidx
  on public.chat_admin_directory_groups(admin_profile_id, lower(name));

create table if not exists public.chat_admin_directory_group_members (
  admin_profile_id uuid not null,
  target_profile_id uuid not null references public.chat_profiles(id) on delete cascade,
  group_id uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (admin_profile_id, target_profile_id),
  foreign key (admin_profile_id, group_id)
    references public.chat_admin_directory_groups(admin_profile_id, group_id)
    on delete cascade
);

alter table public.chat_admin_directory_groups enable row level security;
alter table public.chat_admin_directory_group_members enable row level security;

revoke all on public.chat_admin_directory_groups from public, anon, authenticated;
revoke all on public.chat_admin_directory_group_members from public, anon, authenticated;

create or replace function public.chat_admin_list_directory_groups()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := public.chat_current_profile_id();
  v_result jsonb;
begin
  if v_admin is null or not exists (
    select 1 from public.chat_profiles
    where id = v_admin and is_admin and deleted_at is null
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'group_id', g.group_id,
      'name', g.name,
      'profile_ids', coalesce((
        select jsonb_agg(m.target_profile_id order by m.assigned_at, m.target_profile_id)
        from public.chat_admin_directory_group_members m
        where m.admin_profile_id = g.admin_profile_id and m.group_id = g.group_id
      ), '[]'::jsonb)
    ) order by g.created_at, g.group_id
  ), '[]'::jsonb)
  into v_result
  from public.chat_admin_directory_groups g
  where g.admin_profile_id = v_admin;

  return v_result;
end;
$function$;

create or replace function public.chat_admin_create_directory_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := public.chat_current_profile_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_group public.chat_admin_directory_groups;
begin
  if v_admin is null or not exists (
    select 1 from public.chat_profiles
    where id = v_admin and is_admin and deleted_at is null
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'invalid_group_name';
  end if;
  if exists (
    select 1 from public.chat_admin_directory_groups
    where admin_profile_id = v_admin and lower(name) = lower(v_name)
  ) then
    raise exception 'group_name_taken';
  end if;

  insert into public.chat_admin_directory_groups(admin_profile_id, name)
  values (v_admin, v_name)
  returning * into v_group;

  return jsonb_build_object('group_id', v_group.group_id, 'name', v_group.name);
end;
$function$;

create or replace function public.chat_admin_delete_directory_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := public.chat_current_profile_id();
begin
  if v_admin is null or not exists (
    select 1 from public.chat_profiles
    where id = v_admin and is_admin and deleted_at is null
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  delete from public.chat_admin_directory_groups
  where admin_profile_id = v_admin and group_id = p_group_id;
  return found;
end;
$function$;

create or replace function public.chat_admin_assign_directory_group(p_target_profile_id uuid, p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := public.chat_current_profile_id();
begin
  if v_admin is null or not exists (
    select 1 from public.chat_profiles
    where id = v_admin and is_admin and deleted_at is null
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.chat_profiles
    where id = p_target_profile_id
      and not is_admin
      and user_level = 2
      and deleted_at is null
  ) then
    raise exception 'customer_required';
  end if;

  if p_group_id is null then
    delete from public.chat_admin_directory_group_members
    where admin_profile_id = v_admin and target_profile_id = p_target_profile_id;
    return true;
  end if;

  if not exists (
    select 1 from public.chat_admin_directory_groups
    where admin_profile_id = v_admin and group_id = p_group_id
  ) then
    raise exception 'group_required';
  end if;

  insert into public.chat_admin_directory_group_members(admin_profile_id, target_profile_id, group_id)
  values (v_admin, p_target_profile_id, p_group_id)
  on conflict (admin_profile_id, target_profile_id)
  do update set group_id = excluded.group_id, assigned_at = now();
  return true;
end;
$function$;

revoke all on function public.chat_admin_list_directory_groups() from public, anon;
revoke all on function public.chat_admin_create_directory_group(text) from public, anon;
revoke all on function public.chat_admin_delete_directory_group(uuid) from public, anon;
revoke all on function public.chat_admin_assign_directory_group(uuid, uuid) from public, anon;
grant execute on function public.chat_admin_list_directory_groups() to authenticated;
grant execute on function public.chat_admin_create_directory_group(text) to authenticated;
grant execute on function public.chat_admin_delete_directory_group(uuid) to authenticated;
grant execute on function public.chat_admin_assign_directory_group(uuid, uuid) to authenticated;
