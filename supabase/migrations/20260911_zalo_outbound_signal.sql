create or replace function v21_private.zalo_outbound_signal()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'v21_private', 'net'
as $$
begin
  if new.direction <> 'outbound' or new.state <> 'pending' then
    return new;
  end if;

  if (now() at time zone 'Asia/Ho_Chi_Minh')::time < time '05:00' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/v21-zalo-signal',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('delivery_id',new.id),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

revoke all on function v21_private.zalo_outbound_signal() from public;

drop trigger if exists zalo_outbound_signal_trg on public.zalo_message_links;
create trigger zalo_outbound_signal_trg
after insert on public.zalo_message_links
for each row
when (new.direction = 'outbound' and new.state = 'pending')
execute function v21_private.zalo_outbound_signal();
