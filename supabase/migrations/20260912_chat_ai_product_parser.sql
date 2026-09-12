begin;

-- Chat AI only: enqueue user -> admin text for product-name parsing.
-- This intentionally does not read or mutate any sales/order session state.
create or replace function public.getlink_ai_enqueue_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_other_admin boolean := false;
begin
  if new.deleted_at is not null or btrim(coalesce(new.body,''))='' then
    return new;
  end if;

  select a.role into v_role
  from public.v21_accounts a
  where a.id=new.sender_account_id
    and a.deleted_at is null
    and a.locked_at is null;

  if v_role is distinct from 'user' then
    return new;
  end if;

  select exists(
    select 1
    from public.v21_conversations c
    join public.v21_accounts a
      on a.id = case when c.member_a=new.sender_account_id then c.member_b else c.member_a end
    where c.id=new.conversation_id
      and new.sender_account_id in (c.member_a,c.member_b)
      and a.role='admin'
      and a.deleted_at is null
      and a.locked_at is null
  ) into v_other_admin;

  if not v_other_admin then
    return new;
  end if;

  insert into public.getlink_ai_message_inbox(
    message_id,conversation_id,customer_account_id,message_body,message_created_at,available_after
  ) values (
    new.id,new.conversation_id,new.sender_account_id,new.body,new.created_at,new.created_at + interval '4 seconds'
  )
  on conflict(message_id) do nothing;

  return new;
end;
$$;

revoke all on function public.getlink_ai_enqueue_chat_message() from public, anon, authenticated;

drop trigger if exists getlink_ai_enqueue_chat_message_trg on public.v21_messages;
create trigger getlink_ai_enqueue_chat_message_trg
after insert on public.v21_messages
for each row execute function public.getlink_ai_enqueue_chat_message();

commit;
