-- Event-driven Zalo link routing.
-- Render keeps only a tiny local set of linked Zalo ids. Refresh it only when
-- a link row changes, so unlinked inbound Zalo traffic never needs an Edge/RPC
-- lookup and there is no recurring link poll.

create or replace function v21_private.zalo_link_routes_signal()
returns trigger
language plpgsql
security definer
set search_path to 'public','v21_private','net'
as $function$
declare
  v_token_hash text;
begin
  if tg_op='UPDATE'
     and new.zalo_id is not distinct from old.zalo_id
     and new.chat_account_id is not distinct from old.chat_account_id
     and new.linked_by_account_id is not distinct from old.linked_by_account_id
  then
    return new;
  end if;

  select token_sha256 into v_token_hash
  from public.v21_zalo_bridge_auth
  where id='primary';

  if length(coalesce(v_token_hash,''))=64 then
    perform net.http_post(
      url := 'https://taphoa-zalo.onrender.com/links-refresh',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-bridge-token-sha256',v_token_hash
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function v21_private.zalo_link_routes_signal() from public;

drop trigger if exists zalo_link_routes_signal_trg on public.zalo_user_links;
create trigger zalo_link_routes_signal_trg
after insert or update or delete on public.zalo_user_links
for each row execute function v21_private.zalo_link_routes_signal();
