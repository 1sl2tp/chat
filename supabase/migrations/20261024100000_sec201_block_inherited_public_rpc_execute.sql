-- SEC-201 follow-up: PostgreSQL grants EXECUTE to PUBLIC by default.
-- REVOKE anon alone does not restrict inherited PUBLIC grants.
-- Require the authenticated role while preserving signed-in Chat operations.
REVOKE EXECUTE ON FUNCTION public.v21_auth_logout(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_auth_logout(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.v21_auth_register_account(text,text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_auth_register_account(text,text,uuid,text,text) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.v21_contacts_list(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_contacts_list(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.v21_conversation_open(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_conversation_open(uuid,uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.v21_mark_read(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_mark_read(uuid,uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.v21_message_send(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_message_send(uuid,uuid,text,text) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.v21_messages_list(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_messages_list(uuid,uuid,integer) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.v21_sync_pull(uuid,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_sync_pull(uuid,bigint,integer) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.v21_unread_count(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_unread_count(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.chat_bank_bill_wake_on_agribank_notification()
FROM PUBLIC,anon,authenticated;
