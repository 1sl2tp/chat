-- SEC-201: Reduce unnecessary anonymous RPC exposure for functions
-- that already require a valid Supabase Auth identity/session.
-- All actual logged-in application sessions have role authenticated.
REVOKE EXECUTE ON FUNCTION public.v21_auth_logout(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v21_auth_register_account(text,text,uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v21_contacts_list(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v21_conversation_open(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v21_mark_read(uuid,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v21_message_send(uuid,uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v21_messages_list(uuid,uuid,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v21_sync_pull(uuid,bigint,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v21_unread_count(uuid) FROM anon;

-- Trigger functions are not callable as normal REST RPCs. This prevents
-- unnecessary direct EXECUTE permissions without affecting triggers.
REVOKE EXECUTE ON FUNCTION public.chat_bank_bill_wake_on_agribank_notification()
FROM anon,authenticated;

-- Trigger does not access tables and needs no caller-controlled search_path.
ALTER FUNCTION v21_private.chat_sync_finance_switch()
SET search_path=pg_catalog,public,pg_temp;
