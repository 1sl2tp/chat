-- Admin can keep one active app session per approved device.
-- Existing registered devices are backfilled as approved. New Admin device keys
-- are stored as pending until another active Admin device approves them.

alter table public.v21_devices
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_account_id uuid references public.v21_accounts(id);

update public.v21_devices
set approved_at=coalesce(approved_at,created_at),
    approved_by_account_id=coalesce(approved_by_account_id,account_id)
where approved_at is null
  and revoked_at is null;

drop index if exists public.v21_sessions_one_active_per_account;
create unique index if not exists v21_sessions_one_active_per_device
  on public.v21_sessions(device_id)
  where revoked_at is null;

create or replace function v21_private.open_session(
  p_account_id uuid,
  p_device_key uuid,
  p_label text,
  p_platform text
) returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_auth_session_id uuid := v21_private.current_auth_session_id();
  v_account public.v21_accounts;
  v_device public.v21_devices;
  v_existing public.v21_sessions;
  v_new public.v21_sessions;
  v_revoked record;
  v_label text := left(coalesce(nullif(btrim(p_label),''),'Thiết bị'),100);
  v_platform text := left(coalesce(nullif(btrim(p_platform),''),'web'),50);
begin
  if auth.uid() is null or v_auth_session_id is null then raise exception 'authentication_required'; end if;
  if p_device_key is null then raise exception 'device_key_required'; end if;

  select * into v_account
  from public.v21_accounts
  where id=p_account_id
    and auth_user_id=auth.uid()
    and deleted_at is null
    and locked_at is null
  for update;

  if not found then
    if exists(
      select 1 from public.v21_accounts
      where id=p_account_id and auth_user_id=auth.uid() and locked_at is not null
    ) then
      raise exception 'account_locked';
    end if;
    raise exception 'account_required';
  end if;

  select * into v_existing
  from public.v21_sessions
  where auth_session_id=v_auth_session_id
  for update;

  if found then
    if v_existing.account_id <> p_account_id then raise exception 'session_account_mismatch'; end if;
    if v_existing.revoked_at is not null then raise exception 'session_revoked'; end if;

    select * into v_device
    from public.v21_devices
    where id=v_existing.device_id and account_id=p_account_id;

    if not found or v_device.device_key <> p_device_key then raise exception 'device_mismatch'; end if;
    if v_account.role='admin' and (v_device.approved_at is null or v_device.revoked_at is not null) then
      raise exception 'device_approval_required';
    end if;

    update public.v21_sessions
      set last_seen_at=now()
      where app_session_id=v_existing.app_session_id;
    update public.v21_devices
      set label=v_label,platform=v_platform,last_seen_at=now()
      where id=v_existing.device_id;

    return jsonb_build_object(
      'status','active',
      'app_session_id',v_existing.app_session_id,
      'device_id',v_existing.device_id,
      'auth_session_id',v_auth_session_id
    );
  end if;

  select * into v_device
  from public.v21_devices
  where account_id=p_account_id and device_key=p_device_key
  for update;

  if v_account.role='admin' then
    if not found then
      insert into public.v21_devices(
        account_id,device_key,label,platform,created_at,last_seen_at,revoked_at,approved_at,approved_by_account_id
      )
      values(
        p_account_id,p_device_key,v_label,v_platform,now(),now(),null,null,null
      )
      returning * into v_device;

      return jsonb_build_object(
        'status','approval_required',
        'device_id',v_device.id,
        'auth_session_id',v_auth_session_id
      );
    end if;

    update public.v21_devices
      set label=v_label,platform=v_platform,last_seen_at=now()
      where id=v_device.id
      returning * into v_device;

    if v_device.approved_at is null or v_device.revoked_at is not null then
      return jsonb_build_object(
        'status','approval_required',
        'device_id',v_device.id,
        'auth_session_id',v_auth_session_id
      );
    end if;

    for v_revoked in
      update public.v21_sessions
      set revoked_at=now(),last_seen_at=now()
      where device_id=v_device.id and revoked_at is null
      returning app_session_id
    loop
      insert into public.v21_session_events(account_id,target_app_session_id,kind)
      values(p_account_id,v_revoked.app_session_id,'revoked');
    end loop;
  else
    if not found then
      insert into public.v21_devices(
        account_id,device_key,label,platform,created_at,last_seen_at,revoked_at,approved_at,approved_by_account_id
      )
      values(
        p_account_id,p_device_key,v_label,v_platform,now(),now(),null,now(),p_account_id
      )
      returning * into v_device;
    else
      update public.v21_devices
      set label=v_label,
          platform=v_platform,
          last_seen_at=now(),
          revoked_at=null,
          approved_at=coalesce(approved_at,now()),
          approved_by_account_id=coalesce(approved_by_account_id,p_account_id)
      where id=v_device.id
      returning * into v_device;
    end if;

    for v_revoked in
      update public.v21_sessions
      set revoked_at=now(),last_seen_at=now()
      where account_id=p_account_id and revoked_at is null
      returning app_session_id
    loop
      insert into public.v21_session_events(account_id,target_app_session_id,kind)
      values(p_account_id,v_revoked.app_session_id,'revoked');
    end loop;
  end if;

  insert into public.v21_sessions(auth_session_id,account_id,device_id,created_at,last_seen_at,revoked_at)
  values(v_auth_session_id,p_account_id,v_device.id,now(),now(),null)
  returning * into v_new;

  return jsonb_build_object(
    'status','active',
    'app_session_id',v_new.app_session_id,
    'device_id',v_device.id,
    'auth_session_id',v_auth_session_id
  );
end;
$$;

create or replace function public.v21_auth_bootstrap(
  p_device_key uuid,
  p_label text default 'Thiết bị',
  p_platform text default 'web'
) returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_account public.v21_accounts;
  v_session jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select * into v_account
  from public.v21_accounts
  where auth_user_id=auth.uid() and deleted_at is null
  limit 1;

  if not found then raise exception 'account_not_registered'; end if;
  if v_account.locked_at is not null then raise exception 'account_locked'; end if;

  v_session := v21_private.open_session(v_account.id,p_device_key,p_label,p_platform);

  return jsonb_build_object(
    'account',jsonb_build_object(
      'id',v_account.id,
      'username',v_account.username,
      'display_name',v_account.display_name,
      'role',v_account.role,
      'avatar_path',v_account.avatar_path,
      'locked_at',v_account.locked_at
    ),
    'session',v_session,
    'device_approval_required',coalesce(v_session->>'status','')='approval_required'
  );
end;
$$;

create or replace function public.v21_admin_devices_list(
  p_app_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_me uuid;
  v_current_device_id uuid;
  v_result jsonb;
begin
  v_me := v21_private.require_active_account(p_app_session_id);
  if not exists(
    select 1 from public.v21_accounts
    where id=v_me and role='admin' and deleted_at is null and locked_at is null
  ) then raise exception 'admin_required'; end if;

  select device_id into v_current_device_id
  from public.v21_sessions
  where app_session_id=p_app_session_id
    and account_id=v_me
    and revoked_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'label',d.label,
    'platform',d.platform,
    'created_at',d.created_at,
    'last_seen_at',d.last_seen_at,
    'approved_at',d.approved_at,
    'revoked_at',d.revoked_at,
    'status',case
      when d.revoked_at is not null then 'revoked'
      when d.approved_at is null then 'pending'
      else 'approved'
    end,
    'current_device',(d.id=v_current_device_id),
    'active_sessions',(
      select count(*) from public.v21_sessions s
      where s.device_id=d.id and s.revoked_at is null
    )
  ) order by
    (d.id=v_current_device_id) desc,
    (d.approved_at is null and d.revoked_at is null) desc,
    d.last_seen_at desc
  ),'[]'::jsonb)
  into v_result
  from public.v21_devices d
  where d.account_id=v_me;

  return v_result;
end;
$$;

create or replace function public.v21_admin_device_approve(
  p_app_session_id uuid,
  p_device_id uuid
) returns boolean
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_me uuid;
begin
  v_me := v21_private.require_active_account(p_app_session_id);
  if not exists(
    select 1 from public.v21_accounts
    where id=v_me and role='admin' and deleted_at is null and locked_at is null
  ) then raise exception 'admin_required'; end if;

  update public.v21_devices
  set approved_at=now(),
      approved_by_account_id=v_me,
      revoked_at=null
  where id=p_device_id and account_id=v_me;

  if not found then raise exception 'device_not_found'; end if;
  return true;
end;
$$;

create or replace function public.v21_admin_device_revoke(
  p_app_session_id uuid,
  p_device_id uuid
) returns boolean
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_me uuid;
  v_current_device_id uuid;
  v_revoked record;
begin
  v_me := v21_private.require_active_account(p_app_session_id);
  if not exists(
    select 1 from public.v21_accounts
    where id=v_me and role='admin' and deleted_at is null and locked_at is null
  ) then raise exception 'admin_required'; end if;

  select device_id into v_current_device_id
  from public.v21_sessions
  where app_session_id=p_app_session_id and account_id=v_me and revoked_at is null;

  if p_device_id=v_current_device_id then raise exception 'cannot_revoke_current_device'; end if;

  update public.v21_devices
  set revoked_at=now(),
      approved_at=null,
      approved_by_account_id=null
  where id=p_device_id and account_id=v_me;

  if not found then raise exception 'device_not_found'; end if;

  for v_revoked in
    update public.v21_sessions
    set revoked_at=now(),last_seen_at=now()
    where device_id=p_device_id and account_id=v_me and revoked_at is null
    returning app_session_id
  loop
    insert into public.v21_session_events(account_id,target_app_session_id,kind)
    values(v_me,v_revoked.app_session_id,'revoked');
  end loop;

  return true;
end;
$$;

revoke all on function public.v21_admin_devices_list(uuid) from public,anon;
revoke all on function public.v21_admin_device_approve(uuid,uuid) from public,anon;
revoke all on function public.v21_admin_device_revoke(uuid,uuid) from public,anon;
grant execute on function public.v21_admin_devices_list(uuid) to authenticated;
grant execute on function public.v21_admin_device_approve(uuid,uuid) to authenticated;
grant execute on function public.v21_admin_device_revoke(uuid,uuid) to authenticated;
