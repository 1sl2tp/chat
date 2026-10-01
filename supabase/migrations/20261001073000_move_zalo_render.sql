-- Move the TAPHOA Zalo bridge from the retired Render service to the new
-- Render workspace/service. The bridge token itself stays only in Render;
-- Supabase stores only its SHA-256 digest.

update public.v21_zalo_bridge_auth
set token_sha256 = '09658c2910f7d9d288f18bd0cb137df208ab0895329aacb6fc3acbfcb1681430',
    updated_at = now()
where id = 'primary';

create or replace function v21_private.zalo_outbound_signal()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'v21_private', 'net'
as $$
declare
  v_token_hash text;
begin
  if new.direction <> 'outbound' or new.state <> 'pending' then
    return new;
  end if;

  if (now() at time zone 'Asia/Ho_Chi_Minh')::time < time '05:00' then
    return new;
  end if;

  select token_sha256 into v_token_hash
  from public.v21_zalo_bridge_auth
  where id='primary';

  if length(coalesce(v_token_hash,'')) <> 64 then
    return new;
  end if;

  perform net.http_post(
    url := 'https://taphoa-zalo-bridge.onrender.com/outbound-now',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-bridge-token-sha256',v_token_hash
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

revoke all on function v21_private.zalo_outbound_signal() from public;

-- Remove any old keepalive jobs that still point at the retired Render URL.
do $$
declare
  r record;
begin
  if to_regclass('cron.job') is not null then
    for r in
      select jobid
      from cron.job
      where command ilike '%taphoa-zalo-login.onrender.com%'
         or jobname = 'v21-zalo-bridge-keepalive'
    loop
      perform cron.unschedule(r.jobid);
    end loop;
  end if;
exception when others then
  raise notice 'Skipping old Zalo keepalive cleanup: %', sqlerrm;
end;
$$;

-- Keep the free Render listener warm only during the operating window used by
-- the existing bridge: every 12 minutes, 05:00-23:48 Asia/Ho_Chi_Minh.
select cron.schedule(
  'v21-zalo-bridge-keepalive',
  '0,12,24,36,48 5-23 * * *',
  $job$
    select net.http_get(
      url := 'https://taphoa-zalo-bridge.onrender.com/health',
      timeout_milliseconds := 5000
    );
  $job$
);
