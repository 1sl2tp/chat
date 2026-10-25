-- CASH-218: Preserve collection amount, correct Admin cash confirmation routing.
DO $fix$
DECLARE fn text;
BEGIN
 SELECT pg_get_functiondef('public.chat_admin_quick_cash_collect(uuid,uuid,bigint,text,uuid)'::regprocedure) INTO fn;
 IF position('''taphoa:''||p_command_id::text||'':collection''' IN fn)>0 THEN RETURN; END IF;
 IF position('''taphoa:quick-cash:''||p_command_id::text' IN fn)=0
   OR position('v21_private.require_active_account' IN fn)=0
   OR position('pg_advisory_xact_lock' IN fn)=0
   OR position('INSERT INTO public.taphoa_debt_ledger' IN fn)=0
 THEN RAISE EXCEPTION 'cash218_contract_changed'; END IF;
 fn:=replace(fn,'''taphoa:quick-cash:''||p_command_id::text',
             '''taphoa:''||p_command_id::text||'':collection''');
 EXECUTE fn;
END $fix$;
-- One-time idempotent notice correction: DO NOT create a collection/ledger entry.
DO $repair$
DECLARE
 v_command uuid:='42f7af48-f9ee-4736-ae67-b5cfd369ef58';
 v_customer uuid:='32465e32-80ef-47e1-8afa-fa3f8d496341';
 v_result jsonb; v_sender uuid; v_ledger bigint;
 v_body text;v_url text;v_sent uuid;
BEGIN
 SELECT c.result INTO v_result FROM public.taphoa_command_log c
 WHERE c.command_id=v_command AND c.operation='debt_transaction' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'cash218_missing_command'; END IF;
 IF coalesce(v_result->>'notice_sent','false')='true' THEN RETURN; END IF;
 IF v_result->>'source' IS DISTINCT FROM 'manual_cash'
  OR v_result->>'customer_id' IS DISTINCT FROM v_customer::text
  OR v_result->>'receipt_kind' IS DISTINCT FROM 'collection'
  OR (v_result->>'source_amount_vnd')::bigint IS DISTINCT FROM 795000
 THEN RAISE EXCEPTION 'cash218_command_not_verified'; END IF;
 v_ledger:=(v_result->>'ledger_id')::bigint;
 SELECT l.created_by_account_id INTO v_sender FROM public.taphoa_debt_ledger l
 WHERE l.id=v_ledger AND l.customer_account_id=v_customer
  AND l.entry_type='collection' AND l.amount_vnd=-795 AND l.note=v_result->>'receipt_note';
 IF v_sender IS NULL THEN RAISE EXCEPTION 'cash218_ledger_not_verified'; END IF;
 IF NOT v21_private.chat_outbound_allowed(v_customer,'taphoa:'||v_command::text||':collection')
 THEN RAISE EXCEPTION 'cash218_recipient_optout'; END IF;
 v_body:='✅ Đã thu · '||public.taphoa_chat_money((v_result->>'amount_vnd')::numeric)
  ||E'\n'||public.taphoa_chat_balance_label((v_result->>'balance_before_vnd')::numeric,true)
  ||E'\n'||public.taphoa_chat_balance_label((v_result->>'balance_after_vnd')::numeric,false)
  ||E'\nGhi chú: '||(v_result->>'receipt_note');
 v_url:=public.taphoa_customer_mini_link(v_customer,'no',null,null,null);
 IF coalesce(v_url,'')<>'' THEN v_body:=v_body||E'\nXem công nợ: '||v_url; END IF;
 v_sent:=public.taphoa_chat_notify_customer(v_customer,v_sender,
 'taphoa:'||v_command::text||':collection',v_body);
 IF v_sent IS NULL THEN RAISE EXCEPTION 'cash218_notice_not_created'; END IF;
 UPDATE public.taphoa_command_log SET result=v_result||jsonb_build_object(
   'notice_sent',true,'notice_message_id',v_sent,'notice_repaired_at',clock_timestamp()
 ) WHERE command_id=v_command;
END $repair$;