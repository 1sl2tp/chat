-- NCC-002: one event -> at most one async OCR wake; no cron, no polling, no auto price writes.
-- Requires Vault secret 'ncc_invoice_webhook_secret' and same value as
-- Edge NCC_INVOICE_WEBHOOK_SECRET. If absent, the durable inbox stays pending.
-- Edge v21-ncc-invoice must deploy with verify_jwt=false; its own handler
-- accepts ONLY an authenticated Chat admin or the event-only secret.
create or replace function public.chat_ncc_wake_invoice_scan()
returns trigger language plpgsql security definer set search_path=public,net,vault as $$
declare v_secret text;
begin
 if new.status<>'pending' then return new; end if;
 begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name='ncc_invoice_webhook_secret' limit 1;
 exception when undefined_table or undefined_column then return new;
 end;
 if v_secret is null or length(v_secret)<32 then return new; end if;
 perform net.http_post(
  url:='https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-ncc-invoice',
  headers:=jsonb_build_object('content-type','application/json','x-ncc-hook-secret',v_secret),
  body:=jsonb_build_object('action','scan','id',new.id),
  timeout_milliseconds:=5000
 );
 return new;
exception when others then
 -- Never roll back a Chat media delivery if AI/webhook infrastructure is unavailable.
 -- The inbox row remains pending, for explicit Admin scan later.
 return new;
end;
$$;
revoke all on function public.chat_ncc_wake_invoice_scan() from public,anon,authenticated;
drop trigger if exists chat_ncc_auto_scan_on_receipt on public.chat_ncc_invoices;
create trigger chat_ncc_auto_scan_on_receipt
after insert on public.chat_ncc_invoices
for each row execute function public.chat_ncc_wake_invoice_scan();
