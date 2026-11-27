-- Candidate: read-only proof, no ticket, media, message or financial write.
begin;
create or replace function v21_private.finance_notice_snapshot_proof(p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 ctx jsonb:=public.taphoa_access_context();
 actor uuid:=nullif(ctx->>'account_id','')::uuid;
 msg public.v21_messages;
 cmd public.taphoa_command_log;
 event jsonb;
 customer uuid;
 kind text;
 movement numeric;
 amount numeric;
 before_balance numeric;
 after_balance numeric;
 ledger_count integer;
 ledger_id bigint;
begin
 if auth.uid() is null or actor is null or ctx->>'taphoa_role' is distinct from 'admin'
   or not coalesce((ctx->>'allowed')::boolean,false)
   or not exists(select 1 from public.v21_accounts a where a.id=actor and a.auth_user_id=auth.uid()
    and a.role='admin' and a.deleted_at is null and a.locked_at is null)
 then raise exception 'finance_notice_admin_required' using errcode='42501'; end if;
 select * into msg from public.v21_messages m where m.id=p_message_id
  and m.sender_account_id=actor and m.deleted_at is null
  and m.client_id ~ '^taphoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(debt|collection)$'
  and m.created_at>=now()-interval '30 days';
 if not found then return jsonb_build_object('state','blocked'); end if;
 select * into cmd from public.taphoa_command_log l where l.command_id=split_part(msg.client_id,':',2)::uuid
  and l.operation='debt_transaction' and l.created_at=msg.created_at
  and l.result->>'ok'='true' and l.result->>'notice_sent'='true';
 if not found then return jsonb_build_object('state','review'); end if;
 event:=cmd.result;
 if coalesce(event->>'customer_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(event->>'receipt_kind','') not in ('collection','payment')
  or not (event ?& array['amount_vnd','movement','balance_before_vnd','balance_after_vnd','receipt_at'])
 then return jsonb_build_object('state','review'); end if;
 customer:=(event->>'customer_id')::uuid;
 kind:=event->>'receipt_kind';
 if split_part(msg.client_id,':',3) is distinct from case when kind='collection' then 'collection' else 'debt' end
  or not exists(select 1 from public.v21_conversations c where c.id=msg.conversation_id
   and ((c.member_a=actor and c.member_b=customer) or (c.member_b=actor and c.member_a=customer)))
  or not exists(select 1 from public.v21_accounts a where a.id=customer and a.role='user' and a.contact_group='customer' and a.deleted_at is null and a.locked_at is null)
  or not v21_private.chat_outbound_allowed(customer,msg.client_id)
 then return jsonb_build_object('state','blocked'); end if;
 if exists(select 1 from public.v21_media_assets a where a.message_id=msg.id and a.deleted_at is null) then
  return jsonb_build_object('state','media_exists_review'); end if;
 begin
  amount:=(event->>'amount_vnd')::numeric; movement:=(event->>'movement')::numeric;
  before_balance:=(event->>'balance_before_vnd')::numeric;after_balance:=(event->>'balance_after_vnd')::numeric;
  if amount is null or movement is null or before_balance is null or after_balance is null
   or amount<=0 or movement is distinct from case when kind='collection' then -amount else amount end
   or after_balance-before_balance is distinct from movement
  then return jsonb_build_object('state','review'); end if;
  if event->>'source'='manual_cash' then
   if kind<>'collection' or (event->>'source_amount_vnd')::numeric is distinct from amount*1000
    or coalesce(event->>'ledger_id','') !~ '^[1-9][0-9]*$'
   then return jsonb_build_object('state','review'); end if;
   ledger_id:=(event->>'ledger_id')::bigint;
   select count(*) into ledger_count from public.taphoa_debt_ledger d where d.id=ledger_id
     and d.customer_account_id=customer and d.created_by_account_id=actor
     and d.entry_type=kind and d.amount_vnd=movement and d.created_at=cmd.created_at;
  elsif event->>'source' is null then
   select count(*),min(d.id) into ledger_count,ledger_id from public.taphoa_debt_ledger d where d.customer_account_id=customer
    and d.created_by_account_id=actor and d.entry_type=kind and d.amount_vnd=movement and d.created_at=cmd.created_at;
  else return jsonb_build_object('state','review'); end if;
 exception when invalid_text_representation or numeric_value_out_of_range then
   return jsonb_build_object('state','review');
 end;
 if ledger_count<>1 then return jsonb_build_object('state','review'); end if;
 -- Read-only historical preview: no automatic image policy is inferred.
 return jsonb_build_object('state','verified_snapshot','message_id',msg.id,'command_id',cmd.command_id,
   'ledger_id',ledger_id,'event',event,'proof',jsonb_build_object('authorized',true,'messageLive',true,
   'recipientMatch',true,'senderMatch',true,'commandMatch',true,'ledgerMatch',true,'eventMatch',true),
   'image_policy','explicit_review_required');
end $$;
revoke all on function v21_private.finance_notice_snapshot_proof(uuid) from public,anon,authenticated;
grant execute on function v21_private.finance_notice_snapshot_proof(uuid) to authenticated;
create or replace function public.finance_notice_snapshot_proof(p_message_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select v21_private.finance_notice_snapshot_proof(p_message_id) $$;
revoke all on function public.finance_notice_snapshot_proof(uuid) from public,anon,authenticated;
grant execute on function public.finance_notice_snapshot_proof(uuid) to authenticated;
commit;
