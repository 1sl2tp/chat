# TELE-005 · Chỉ tạo Topic cho 143 tài khoản Chat (chưa gửi tin thật)

SOURCE: 143 Chat account UUIDs and names from public.v21_accounts with role=user and deleted_at IS NULL. No Zalo contact reads, no message transport, no Order/Bank/CRM operations.

The creator is an isolated Edge Function (v21-telegram-directory-sync) with GET /status and POST /run. It requires a FRESH /sync143 Telegram message originating from the configured admin ID **in the exact private TAPHOA Chat bot chat**. The command must be no older than 10 minutes, and the bot must have private Topics enabled and NO other webhook owner. A public HTTP request cannot authorize a sync by itself.

On POST /run after Telegram admin command:
1. Reads exactly 143 active Chat accounts, aborts if the snapshot count changes.
2. Reads existing rows in v21_telegram_topic_links for the configured Telegram chat.
3. Bulk inserts missing rows as reserved using ON CONFLICT DO NOTHING. Never overwrites existing mapping.
4. For each reserved row, atomically updates reserved -> needs_review BEFORE calling createForumTopic. This ensures a crash/uncertain API response cannot cause an automatic duplicate on retry.
5. On Telegram ACK, stores actual message_thread_id and state=active. On uncertain API timeout, failure or database update mismatch, keeps needs_review and STOPS the batch. No fallback to General or another chat.
6. Handles in small groups of three; no cron, no background polling, no extra timer. HTTP status returns counts without names.
7. On future deliberate /sync143 after a partial response, skip active and uncertain rows, only work on reserved/unmapped rows. Any needs_review row must be reconciled manually.

Bot API requests from ap-southeast-1 were previously timing out. Invoke the endpoint in us-east-1 (forceFunctionRegion=us-east-1) and verify logs show actual us-east-1.

This is the directory bootstrap only. It does NOT send any customer message to Telegram, does NOT route replies to Chat or Zalo, and does NOT implement product/order/payment operations. The old Chat UI remains owner of all business workflows. 143 topics are NOT automatically created merely by deploying this function.

Safety: this worker needs explicit /sync143 Telegram admin intent and uses service-role only in Supabase Edge, no token in frontend/GitHub. No migration is added beyond the user-approved TELE-004 mapping table.
