revoke all on schema chat_private from public, anon, authenticated;
revoke all on schema v21_private from public, anon, authenticated;
revoke all on schema v21_storage_private from public, anon, authenticated;
revoke all on schema business_private from public, anon, authenticated;

grant usage on schema chat_private to anon, authenticated, service_role;
grant usage on schema v21_private to authenticated, service_role;
grant usage on schema v21_storage_private to authenticated, service_role;
grant usage on schema business_private to service_role;

revoke execute on all functions in schema chat_private from public, anon, authenticated;
revoke execute on all functions in schema v21_private from public, anon, authenticated;
revoke execute on all functions in schema v21_storage_private from public, anon, authenticated;
revoke execute on all functions in schema business_private from public, anon, authenticated;

grant execute on all functions in schema chat_private to service_role;
grant execute on all functions in schema v21_private to service_role;
grant execute on all functions in schema v21_storage_private to service_role;
grant execute on all functions in schema business_private to service_role;

grant execute on function chat_private.bootstrap_guest(uuid) to anon, authenticated;
grant execute on function chat_private.get_my_chat_list(uuid) to anon, authenticated;
grant execute on function chat_private.get_or_create_direct_conversation(uuid,uuid) to anon, authenticated;
grant execute on function chat_private.mark_conversation_read(uuid,uuid) to anon, authenticated;
grant execute on function chat_private.send_text_message(uuid,uuid,uuid,text) to anon, authenticated;
grant execute on function chat_private.update_guest_profile(uuid,text,text) to anon, authenticated;

grant execute on function chat_private.is_call_participant(uuid,uuid) to authenticated;
grant execute on function chat_private.is_current_conversation_member(uuid) to authenticated;
grant execute on function chat_private.shares_active_conversation(uuid,uuid) to authenticated;
grant execute on function chat_private.try_uuid(text) to authenticated;

grant execute on function v21_private.v21_call_accept(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_cancel(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_end(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_get(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_livekit_authorize(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_media_lost(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_media_ready(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_mic_ready(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_reconcile(uuid) to authenticated;
grant execute on function v21_private.v21_call_reject(uuid,uuid) to authenticated;
grant execute on function v21_private.v21_call_start(uuid,uuid,text) to authenticated;

grant execute on function v21_private.can_access_conversation(uuid) to authenticated;
grant execute on function v21_private.can_manage_avatar_object(text) to authenticated;
grant execute on function v21_private.current_active_account_id() to authenticated;
grant execute on function v21_private.is_current_admin() to authenticated;

grant execute on function v21_storage_private.can_read(text) to authenticated;
grant execute on function v21_storage_private.can_upload(text) to authenticated;

alter default privileges for role postgres in schema chat_private
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema v21_private
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema v21_storage_private
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema business_private
  revoke execute on functions from public, anon, authenticated, service_role;
