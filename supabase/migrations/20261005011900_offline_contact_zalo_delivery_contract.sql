-- Offline Chat/Zalo delivery contract.
-- Presence/session state must not control contact-directory membership.
-- Manual Admin -> Zalo delivery should signal the bridge immediately at any hour;
-- scheduled customer-care already owns its own send windows.

create or replace function v21_private.zalo_outbound_signal()
returns trigger
language plpgsql
security definer
set search_path to 'public','v21_private','net'
as $$
declare
  v_token_hash text;
begin
  if new.direction <> 'outbound' or new.state <> 'pending' then
    return new;
  end if;

  select token_sha256 into v_token_hash
  from public.v21_zalo_bridge_auth
  where id='primary';

  if length(coalesce(v_token_hash,'')) <> 64 then
    return new;
  end if;

  perform net.http_post(
    url := 'https://taphoa-zalo.onrender.com/outbound-now',
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
