create or replace function v21_private.v21_hard_delete_user_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, v21_private, auth
as $function$
declare
  v_account_id uuid;
begin
  select id
  into v_account_id
  from public.v21_accounts
  where auth_user_id = old.id
    and role = 'user'
  limit 1;

  if v_account_id is null then
    return old;
  end if;

  delete from public.getlink_debt_ledger
  where customer_account_id = v_account_id
     or created_by_account_id = v_account_id
     or order_id in (
       select id
       from public.getlink_sales_orders
       where customer_account_id = v_account_id
          or created_by_account_id = v_account_id
     );

  delete from public.getlink_sales_orders
  where customer_account_id = v_account_id
     or created_by_account_id = v_account_id;

  delete from public.debts
  where chat_account_id = v_account_id
     or order_id in (
       select id from public.orders where chat_account_id = v_account_id
     );

  delete from public.order_items
  where order_id in (
    select id from public.orders where chat_account_id = v_account_id
  );

  delete from public.orders
  where chat_account_id = v_account_id;

  delete from public.v21_calls
  where caller_account_id = v_account_id
     or callee_account_id = v_account_id
     or ended_by = v_account_id
     or conversation_id in (
       select id
       from public.v21_conversations
       where member_a = v_account_id or member_b = v_account_id
     );

  -- Delete the conversation while the account still exists. This removes all
  -- messages first and avoids ON DELETE SET NULL on reply_sender_account_id
  -- creating a reply row that violates v21_messages_reply_contract_check.
  delete from public.v21_conversations
  where member_a = v_account_id or member_b = v_account_id;

  return old;
end;
$function$;

revoke all on function v21_private.v21_hard_delete_user_cleanup() from public;
revoke all on function v21_private.v21_hard_delete_user_cleanup() from anon;
revoke all on function v21_private.v21_hard_delete_user_cleanup() from authenticated;
