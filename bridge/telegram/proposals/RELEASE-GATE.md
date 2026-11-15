# TELE-004 · Mapping table deployed; Topic batch still gated

The user approved ONE new Telegram mapping table on 2026-11-16. Applied successfully on Supabase Chat project vtqhbhrkdxirqeqkgylo as migration version **20261115223711**, name **telegram_topic_links_service_only_20261116**. The exact deployed DDL is under bridge/telegram/schema/applied-20261115223711-telegram-topic-links.sql.

**Verified:** table exists, no rows at creation, RLS on, no SELECT/INSERT for anon and authenticated, service_role SELECT/INSERT allowed. Primary key on telegram_chat_id+chat_account_id and UNIQUE telegram_chat_id+telegram_thread_id. Foreign key to Chat v21_accounts uses **ON DELETE CASCADE** so an account removal does not get blocked by this auxiliary topic map. No customer, order, bank, or Zalo tables modified. No application cron or triggers added.

A Supabase security advisor INFO about "RLS Enabled No Policy" is **intentional** for this service-only table because anon/authenticated privileges are revoked. Do not add a permissive policy to silence that INFO.

**NEXT gate:** creating real Telegram Topics is NOT part of this migration. Need a separately verified service-only creator, exact Telegram admin identity, atomic row reservation before Bot API call, ACK exact chat/thread, bounded rate and fail-closed uncertain responses. No retry after an ambiguous Telegram API timeout: mark needs_review. Telegram pilot thread #60 is fictional and not mapped.

User's scope for the Topics: 143 existing active Chat user accounts, including Chat accounts with no Zalo link. No import of the 350 raw Zalo contacts and no direct Render/Zalo→Telegram route. The old Chat UI stays active in parallel.

The table was approved, **not** authorization to send real customer messages or make business writes from Telegram. Those remain disabled until separate controlled testing.
