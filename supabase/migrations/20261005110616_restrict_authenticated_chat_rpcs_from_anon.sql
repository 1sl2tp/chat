revoke execute on function public.chat_clear_conversation_for_me(uuid) from public, anon;
grant execute on function public.chat_clear_conversation_for_me(uuid) to authenticated, service_role;

revoke execute on function public.chat_get_contact_identity(uuid) from public, anon;
grant execute on function public.chat_get_contact_identity(uuid) to authenticated, service_role;

revoke execute on function public.chat_get_my_chat_list_v2() from public, anon;
grant execute on function public.chat_get_my_chat_list_v2() to authenticated, service_role;

revoke execute on function public.chat_get_my_friends() from public, anon;
grant execute on function public.chat_get_my_friends() to authenticated, service_role;

revoke execute on function public.chat_get_outgoing_friend_requests() from public, anon;
grant execute on function public.chat_get_outgoing_friend_requests() to authenticated, service_role;

revoke execute on function public.chat_get_support_entry() from public, anon;
grant execute on function public.chat_get_support_entry() to authenticated, service_role;

revoke execute on function public.chat_hide_conversation(uuid) from public, anon;
grant execute on function public.chat_hide_conversation(uuid) to authenticated, service_role;

revoke execute on function public.chat_remove_friend(uuid) from public, anon;
grant execute on function public.chat_remove_friend(uuid) to authenticated, service_role;

revoke execute on function public.chat_set_contact_name(uuid,text) from public, anon;
grant execute on function public.chat_set_contact_name(uuid,text) to authenticated, service_role;

revoke execute on function public.chat_update_my_profile(text,text,text) from public, anon;
grant execute on function public.chat_update_my_profile(text,text,text) to authenticated, service_role;

revoke execute on function public.chat_update_my_profile(text,text,text,text) from public, anon;
grant execute on function public.chat_update_my_profile(text,text,text,text) to authenticated, service_role;
