-- TAPHOA CHAT V3 security hardening.
-- Prepared locally only. Do not apply to production until deployment is explicitly approved.
-- Anonymous Supabase users remain supported because signInAnonymously() uses the authenticated Postgres role.

drop policy if exists "chat prototype profiles readable" on public.chat_profiles;
drop policy if exists "chat prototype conversations readable" on public.chat_conversations;
drop policy if exists "chat prototype memberships readable" on public.chat_conversation_members;
drop policy if exists "chat prototype messages readable" on public.chat_messages;

revoke select on table public.chat_profiles from anon;
revoke select on table public.chat_conversations from anon;
revoke select on table public.chat_conversation_members from anon;
revoke select on table public.chat_messages from anon;
