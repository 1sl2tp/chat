alter policy chat_call_invites_creator_select
on public.chat_call_invites
using ((select auth.uid()) = created_by_account_id);
