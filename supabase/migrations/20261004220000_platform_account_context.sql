begin;

-- Canonical shared account identity for Chat + TAPHOA + GETLINK.
-- Legacy role/contact_group remain stored for compatibility, but new code
-- consumes account_class + app capabilities from this single owner.
create or replace function public.platform_account_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public,auth
as $$
declare
  a public.v21_accounts;
  v_class text;
  v_taphoa_mode text;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'authenticated',false,
      'allowed',false,
      'account_id',null,
      'account_class','guest',
      'login_enabled',false,
      'apps',jsonb_build_object(
        'chat',jsonb_build_object('allowed',false),
        'taphoa',jsonb_build_object('allowed',false,'mode',null),
        'getlink',jsonb_build_object('allowed',true,'mode','public')
      ),
      'capabilities',jsonb_build_object(
        'manage_accounts',false,
        'taphoa_admin',false,
        'taphoa_customer',false,
        'getlink_admin',false
      )
    );
  end if;

  select * into a
  from public.v21_accounts
  where auth_user_id=auth.uid()
    and deleted_at is null
  limit 1;

  if not found then
    return jsonb_build_object(
      'authenticated',true,
      'allowed',false,
      'account_id',null,
      'account_class','unregistered',
      'login_enabled',true
    );
  end if;

  if a.locked_at is not null then
    return jsonb_build_object(
      'authenticated',true,
      'allowed',false,
      'account_id',a.id,
      'username',a.username,
      'display_name',a.display_name,
      'account_class',case when a.role='admin' then 'admin'
                           when a.contact_group='customer' then 'customer'
                           else 'contact' end,
      'login_enabled',a.auth_user_id is not null,
      'locked',true
    );
  end if;

  v_class:=case
    when a.role='admin' then 'admin'
    when a.contact_group='customer' then 'customer'
    else 'contact'
  end;

  v_taphoa_mode:=case
    when v_class='admin' then 'admin'
    when v_class='customer' then 'customer'
    else null
  end;

  return jsonb_build_object(
    'authenticated',true,
    'allowed',true,
    'account_id',a.id,
    'auth_user_id',a.auth_user_id,
    'username',a.username,
    'display_name',a.display_name,
    'account_class',v_class,
    'contact_group',a.contact_group,
    'login_enabled',a.auth_user_id is not null,

    -- Transitional compatibility only. New code must use account_class/apps.
    'role',a.role,

    'apps',jsonb_build_object(
      'chat',jsonb_build_object(
        'allowed',true,
        'mode',case when v_class='admin' then 'admin' else 'member' end
      ),
      'taphoa',jsonb_build_object(
        'allowed',v_taphoa_mode is not null,
        'mode',v_taphoa_mode
      ),
      'getlink',jsonb_build_object(
        'allowed',true,
        'mode',case when v_class='admin' then 'admin' else 'public' end
      )
    ),
    'capabilities',jsonb_build_object(
      'manage_accounts',v_class='admin',
      'taphoa_admin',v_class='admin',
      'taphoa_customer',v_class='customer',
      'getlink_admin',v_class='admin'
    )
  );
end;
$$;

revoke all on function public.platform_account_context() from public,anon;
grant execute on function public.platform_account_context() to authenticated;

-- Keep TAPHOA's existing RPC contract while moving classification to the
-- canonical shared account context. No second account/role lookup remains.
create or replace function public.taphoa_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public,auth
as $$
declare
  ctx jsonb:=public.platform_account_context();
  taphoa_allowed boolean:=coalesce((ctx#>>'{apps,taphoa,allowed}')::boolean,false);
  taphoa_mode text:=nullif(ctx#>>'{apps,taphoa,mode}','');
begin
  return jsonb_build_object(
    'account_id',ctx->>'account_id',
    'username',ctx->>'username',
    'display_name',ctx->>'display_name',
    'account_class',ctx->>'account_class',
    'contact_group',ctx->>'contact_group',
    'login_enabled',coalesce((ctx->>'login_enabled')::boolean,false),
    'taphoa_role',taphoa_mode,
    'allowed',taphoa_allowed,
    'capabilities',coalesce(ctx->'capabilities','{}'::jsonb)
  );
end;
$$;

revoke all on function public.taphoa_access_context() from public,anon;
grant execute on function public.taphoa_access_context() to authenticated;

-- Chat keeps its current browser payload for compatibility, but identity and
-- capabilities now come from the same platform_account_context owner.
create or replace function public.v21_auth_bootstrap(
  p_device_key uuid,
  p_label text default 'Thiết bị'::text,
  p_platform text default 'web'::text
)
returns jsonb
language plpgsql
security definer
set search_path = public,v21_private,auth
as $$
declare
  v_ctx jsonb;
  v_account public.v21_accounts;
  v_session jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  v_ctx:=public.platform_account_context();
  if coalesce((v_ctx->>'allowed')::boolean,false) is not true then
    if coalesce((v_ctx->>'locked')::boolean,false) then
      raise exception 'account_locked';
    end if;
    raise exception 'account_not_registered';
  end if;

  select * into v_account
  from public.v21_accounts
  where id=(v_ctx->>'account_id')::uuid
    and deleted_at is null
  limit 1;

  if not found then raise exception 'account_not_registered'; end if;
  if v_account.locked_at is not null then raise exception 'account_locked'; end if;

  v_session:=v21_private.open_session(v_account.id,p_device_key,p_label,p_platform);

  return jsonb_build_object(
    'account',jsonb_build_object(
      'id',v_account.id,
      'username',v_account.username,
      'display_name',v_account.display_name,
      'avatar_path',v_account.avatar_path,
      'locked_at',v_account.locked_at,
      'account_class',v_ctx->>'account_class',
      'login_enabled',coalesce((v_ctx->>'login_enabled')::boolean,false),
      'contact_group',v_ctx->>'contact_group',
      'apps',coalesce(v_ctx->'apps','{}'::jsonb),
      'capabilities',coalesce(v_ctx->'capabilities','{}'::jsonb),

      -- Transitional compatibility only.
      'role',v_account.role
    ),
    'session',v_session,
    'device_approval_required',coalesce(v_session->>'status','')='approval_required'
  );
end;
$$;

revoke all on function public.v21_auth_bootstrap(uuid,text,text) from public,anon;
grant execute on function public.v21_auth_bootstrap(uuid,text,text) to authenticated;

commit;
