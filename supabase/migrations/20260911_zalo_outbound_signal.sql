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
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjbm9haHFzcnF1eGt3a2pidXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY5MDEsImV4cCI6MjEwMzUyMjkwMX0.16EE_LENbAV5oD29XQGpR5c2eYXPqBSWkGTFdOqeRQE',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjbm9haHFzcnF1eGt3a2pidXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY5MDEsImV4cCI6MjEwMzUyMjkwMX0.16EE_LENbAV5oD29XQGpR5c2eYXPqBSWkGTFdOqeRQE'
    ),
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
