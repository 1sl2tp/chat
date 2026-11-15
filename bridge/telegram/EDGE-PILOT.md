# TELE-002 — isolated Supabase Edge Topic smoke test

Bot: @taphoa_chat_bridge_bot. Supabase project: vtqhbhrkdxirqeqkgylo.
No Chat/Render/Zalo/CRM changes. This is a ONE-TIME smoke test, NOT live sync.

## Secrets in Supabase Dashboard > Edge Functions > Secrets

- TELEGRAM_BOT_TOKEN — from BotFather, NEVER put into Git or send in chat
- TELEGRAM_ADMIN_USER_ID — your numeric Telegram ID
- TELEGRAM_PILOT_CHAT_ID — same numeric ID, because the test is a private bot chat

The function NEVER returns secret values or the numeric admin ID. No new DB tables or cron.

## First smoke test

1. Ensure BotFather > Bot Settings > Threaded Mode is enabled and you pressed START at @taphoa_chat_bridge_bot.
2. Check read-only readiness:
   https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-telegram-pilot/status
3. After ready, send exactly /pilot in the chat with @taphoa_chat_bridge_bot.
4. Open ONCE:
   https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/v21-telegram-pilot/probe
5. When "topic_probe_passed", find **🧪 Khách thử TELE-002** in Telegram.
   It must contain one confirmation message. The server verifies the returned Telegram
   message_thread_id AND chat.id match. If a Telegram API error occurs, the test fails closed.
6. Never send a real customer photo or bill in this stage.

Note: /probe is only a manual bootstrap harness. It cannot create topics without a /pilot command
originating from the configured Telegram admin ID in the exact private bot chat. It
consumes the command BEFORE topic creation. Requests are throttled per running isolate.
It does not set webhooks, add polling schedules, or process /pilot without this manual step.
Use it exactly once in the private admin test; do not consider this a production-grade
idempotency mechanism. For multi-device/multi-worker production use, add a durable
idempotency record with a proper migration and authenticated webhook.

## Known limitations

- Telegram private Topics occasionally report BOT_TOPIC_WRONG_HOME; this is surfaced
  as a failure. It does not fall back to General or send to a wrong person.
- This test does not store Telegram Topic mappings in Supabase; it creates just one
  fictional contact/topic. No real account, message, ledger, or Zalo write happens.
- Existing webhook is never replaced. If the bot already has a webhook, the test
  refuses to run.
- Telegram stores a copy of test message in Telegram. No customer data is used.
- The Edge Function verify_jwt=false is intentional because the only operation requires
  a Telegram-signed incoming admin command via the bot's official getUpdates queue;
  a public GET by itself cannot authorize creation. Do NOT extend this public harness
  to send customer messages, write DB, or manage production bots.

## Rollback

Delete standalone v21-telegram-pilot Edge Function (if applicable); revert its
source files. It does not alter any existing Zalo/chat services or migrations.
