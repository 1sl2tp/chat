-- UX-192 follow-up: keep taphoa_command_log.amount_vnd in legacy thousands.\n-- Source VND stays separately in source_amount_vnd.\n-- One-tap entry into Admin's manual CASH collection from Chat.
-- This is separate from the Agribank notice-specific collection flow.
-- Amount API uses whole VND; debt ledger stores whole thousands of VND.
CREATE OR REPLACE FUNCTION public.chat_admin_quick_cash_collect(
 p_app_session_id uuid,p_customer_id uuid,p_amount_vnd bigint,
 p_note text,p_command_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,auth,pg_temp AS $$
DECLARE
 v_admin uuid;
 v_prior jsonb;
 v_amount numeric;
 v_before numeric;
 v_after numeric;
 v_ledger bigint;
 v_body text;
 v_url text;
 v_message uuid;
 v_result jsonb;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (
  SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
  AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL
 ) THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_command_id IS NULL THEN RAISE EXCEPTION 'command_id_required'; END IF;
 IF p_amount_vnd IS NULL OR p_amount_vnd<1000 OR p_amount_vnd>999999999000
  OR mod(p_amount_vnd,1000)<>0
 THEN RAISE EXCEPTION 'invalid_amount_thousands'; END IF;
 IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 5 AND 240
 THEN RAISE EXCEPTION 'collection_note_required'; END IF;
 IF p_customer_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.v21_accounts a WHERE a.id=p_customer_id
  AND a.role='user' AND a.contact_group='customer'
  AND a.deleted_at IS NULL AND a.locked_at IS NULL
 ) THEN RAISE EXCEPTION 'customer_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
 SELECT c.result INTO v_prior FROM public.taphoa_command_log c
  WHERE c.command_id=p_command_id;
 IF FOUND THEN
  IF v_prior->>'customer_id' IS DISTINCT FROM p_customer_id::text
    OR v_prior->>'receipt_kind' IS DISTINCT FROM 'collection'
    OR (v_prior->>'source_amount_vnd')::bigint IS DISTINCT FROM p_amount_vnd
  THEN RAISE EXCEPTION 'command_id_conflict'; END IF;
  RETURN v_prior || jsonb_build_object('replayed',true);
 END IF;
 v_amount:=p_amount_vnd::numeric/1000;
 v_before:=public.taphoa_chat_customer_balance_value(p_customer_id);
 INSERT INTO public.taphoa_debt_ledger(
  customer_account_id,entry_type,amount_vnd,note,created_by_account_id
 ) VALUES (
  p_customer_id,'collection',-v_amount,btrim(p_note),v_admin
 ) RETURNING id INTO v_ledger;
 PERFORM public.taphoa_bump_revision('debt');
 v_after:=public.taphoa_chat_customer_balance_value(p_customer_id);
 v_body:='✅ Đã thu · '||public.taphoa_chat_money(v_amount)
  ||E'\n'||public.taphoa_chat_balance_label(v_before,true)
  ||E'\n'||public.taphoa_chat_balance_label(v_after,false)
  ||E'\nGhi chú: '||btrim(p_note);
 v_url:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
 IF coalesce(v_url,'')<>'' THEN v_body:=v_body||E'\nXem công nợ: '||v_url; END IF;
 v_message:=public.taphoa_chat_notify_customer(
  p_customer_id,v_admin,'taphoa:quick-cash:'||p_command_id::text,v_body
 );
 v_result:=jsonb_build_object(
  'ok',true,'customer_id',p_customer_id::text,'receipt_kind','collection',
  'source','manual_cash','amount_vnd',v_amount,'source_amount_vnd',p_amount_vnd,
  'movement',-v_amount,'ledger_id',v_ledger,'receipt_note',btrim(p_note),
  'balance_before_vnd',v_before,'balance_after_vnd',v_after,
  'receipt_at',clock_timestamp(),'notice_sent',v_message IS NOT NULL
 );
 INSERT INTO public.taphoa_command_log(command_id,operation,result)
 VALUES(p_command_id,'debt_transaction',v_result);
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_admin_quick_cash_collect(uuid,uuid,bigint,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_admin_quick_cash_collect(uuid,uuid,bigint,text,uuid)
 TO authenticated;
