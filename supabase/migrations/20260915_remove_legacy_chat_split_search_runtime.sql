-- Retire the legacy Chat AI/order parsing runtime while preserving historical rows.

update public.chat_ai_runtime_settings
set mode = 'off'
where singleton = true;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'chat-ai-order-scan-15m') then
    perform cron.unschedule('chat-ai-order-scan-15m');
  end if;
end
$$;

drop trigger if exists trg_chat_ai_scan_enqueue_new_customer_message on public.v21_messages;
drop trigger if exists chat_ai_enqueue_message_trg on public.v21_messages;
drop trigger if exists chat_ai_dispatch_inbox_trg on public.chat_ai_message_inbox;

drop function if exists public.chat_ai_scan_enqueue_new_customer_message();
drop function if exists public.chat_ai_scan_enqueue_http();
drop function if exists public.chat_ai_scan_runtime_config();
drop function if exists public.chat_ai_scan_commit(uuid, uuid, bigint, bigint, uuid[], uuid, text, jsonb);
drop function if exists public.chat_order_scribe_runtime_config();
drop function if exists public.chat_order_draft_create(uuid, uuid, text, uuid, jsonb);
drop function if exists public.chat_ai_dispatch_inbox();
drop function if exists public.chat_ai_enqueue_message();
drop function if exists public.chat_ai_claim_turn(uuid);
drop function if exists public.chat_ai_runtime_config();
