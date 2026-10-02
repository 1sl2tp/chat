-- Restore admin Web Push wakeup after Supabase cutover.
-- Canonical messages are already safe; stale notification backlog is expired to avoid delayed spam.

update public.v21_push_outbox
set state='dead',
    last_error='expired_cutover_backlog',
    updated_at=now()
where state in ('pending','retry','processing')
  and created_at < now() - interval '5 minutes';

update public.v21_admin_push_auth a
set token_sha256=encode(extensions.digest(s.token,'sha256'),'hex'),
    updated_at=now()
from v21_private.v21_admin_push_wake_secret s
where a.id='primary'
  and s.id='primary';

create or replace function v21_private.admin_push_signal()
returns trigger
language plpgsql
security definer
set search_path to 'public','v21_private','net'
as $$
declare
  v_token text;
begin
  select token into v_token
  from v21_private.v21_admin_push_wake_secret
  where id='primary';

  if coalesce(v_token,'')='' then return new; end if;

  begin
    perform net.http_post(
      url := 'https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-admin-push',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-push-wake-token',v_token
      ),
      body := jsonb_build_object('action','drain'),
      timeout_milliseconds := 5000
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

revoke all on function v21_private.admin_push_signal() from public;
