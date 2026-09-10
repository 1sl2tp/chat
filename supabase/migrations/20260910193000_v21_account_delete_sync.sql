create or replace function v21_private.emit_account_sync()
returns trigger
language plpgsql
security definer
set search_path = public, v21_private, auth
as $function$
declare
  v_target record;
  v_payload jsonb;
  v_op text;
  v_row public.v21_accounts;
  v_version integer;
begin
  if tg_op = 'DELETE' then
    v_row := old;
    v_op := 'delete';
    v_version := old.version + 1;
  else
    v_row := new;
    v_op := case when new.deleted_at is null then 'upsert' else 'delete' end;
    v_version := new.version;
  end if;

  v_payload := jsonb_build_object(
    'id',v_row.id,
    'username',v_row.username,
    'display_name',v_row.display_name,
    'role',v_row.role,
    'avatar_path',v_row.avatar_path,
    'locked_at',v_row.locked_at,
    'updated_at',v_row.updated_at,
    'deleted_at',case when tg_op = 'DELETE' then coalesce(v_row.deleted_at, now()) else v_row.deleted_at end,
    'version',v_version
  );

  if v_row.role='user' then
    for v_target in
      select a.id from public.v21_accounts a
      where a.role='admin' and a.deleted_at is null and a.id<>v_row.id
    loop
      perform v21_private.emit_sync_event(v_target.id,'account',v_row.id::text,null,v_op,v_version,v_payload);
    end loop;
  elsif v_row.role='admin' then
    for v_target in
      select a.id from public.v21_accounts a
      where a.role='user' and a.deleted_at is null and a.id<>v_row.id
    loop
      perform v21_private.emit_sync_event(v_target.id,'account',v_row.id::text,null,v_op,v_version,v_payload);
    end loop;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists v21_accounts_emit_sync_trg on public.v21_accounts;
create trigger v21_accounts_emit_sync_trg
after insert or update or delete on public.v21_accounts
for each row execute function v21_private.emit_account_sync();
