# TELE-004 · Mapping before live creation of 143 Topics

Status: proposal, code/tests only. Do NOT apply proposed SQL to production without explicit release approval under Chat project rules. This SQL is intentionally outside supabase/migrations to prevent automatic deployment.

Problem: Telegram createForumTopic returns message_thread_id, but Telegram Bot API has no general method to enumerate all Topics and recover associations after an uncertain timeout. Creating all 143 Topics before persisting associations risks duplicates, wrong-user routing, and unrecoverable orphan Topics.

Proposed new mapping table is independent of existing Chat business data. Unique (telegram_chat_id, chat_account_id) ensures at most one Topic per Chat account per Telegram owner; unique (telegram_chat_id, telegram_thread_id) forbids two accounts pointing at one Topic. RLS enabled, service role only, no public policy.

Flow for eventual one-way directory bootstrap:
1. Read only active users from v21_accounts (currently 143). Do NOT query zalo_contacts or sync Render messages.
2. Verify Telegram bot @taphoa_chat_bridge_bot, admin Telegram user/chat ID, and admin authorization.
3. Reserve each unmapped account row atomically. Only successful FIRST insert may call createForumTopic. Existing reserved, active or needs_review must NOT call create again.
4. After Telegram returns a thread ID, write mapping active. On timeout/ambiguous response, set needs_review, stop and inspect manually. Do not blindly retry or redirect to General.
5. Rate-limit small batches, inspect Telegram status, and ensure a stable Topic appears for accounts with no prior messages.
6. After topics all map safely, implement an idempotent Chat canonical message outbox for Chat → Telegram; only then separately evaluate Telegram replies to existing Chat, with authorization and source ownership. Creation of Chat order, debt or bank collection remains in canonical backend only.

Existing Telegram pilot #60 is a fictional demo, not mapped to any real Chat account. Existing Chat frontend, Render→Zalo, business logic, and Supabase DB must remain unchanged until approval.
