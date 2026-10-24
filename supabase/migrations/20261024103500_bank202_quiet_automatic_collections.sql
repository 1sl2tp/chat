-- BANK-202: Quiet automatic Agribank collection (admin preference).
-- A verified bank credit changes the ledger exactly once; it should not post
-- a new Chat bubble for every transaction. The bank report / receipt / ledger
-- and audit log remain complete. Manual collection notices are unchanged.
-- NEVER turn off auto-collection globally, since that would strand receipts.
DO $patch$
DECLARE
  fn text;
  old_gate text := $gate$
  -- Do not silently mutate a customer's balance if a matching collection
  -- notice is disallowed by the existing TAPHOA outbound settings.
  if not v21_private.chat_outbound_allowed(customer,'taphoa:'||r.id::text||':collection') then
    return jsonb_build_object('ok',false,'status','collection_notification_disabled');
  end if;
$gate$;
  old_send text := $send$
  message_id:=public.taphoa_chat_notify_customer(customer,admin,'taphoa:'||r.id::text||':collection',notice);
$send$;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure) INTO fn;
 IF position('BANK-202: ledger-only auto collection' in fn)>0 THEN RETURN; END IF;
 -- Fail closed if important safeguards were removed by another migration.
 IF position('pg_advisory_xact_lock(17812026)' in fn)=0
    OR position('already_manual_collected' in fn)=0
    OR position('possible_manual_collection' in fn)=0
    OR position('duplicate_or_ambiguous' in fn)=0
    OR position('insert into public.taphoa_command_log' in fn)=0
    OR position('insert into public.chat_bank_app_collection_links' in fn)=0
    OR position('insert into public.taphoa_debt_ledger' in fn)=0
 THEN RAISE EXCEPTION 'bank202_auto_collection_safety_contract_changed'; END IF;
 IF position(old_gate in fn)=0 OR position(old_send in fn)=0
 THEN RAISE EXCEPTION 'bank202_notification_source_changed'; END IF;
 -- The operator's auto-collect enabled/ready controls remain enforced.
 -- The generic send_collection toggle is still honored by MANUAL receipts.
 fn:=replace(fn,old_gate,
  E'  -- BANK-202: ledger-only auto collection; notifications are not a prerequisite for a verified credit.\n');
 fn:=replace(fn,old_send,
  E'  -- BANK-202: customer already provided a bill; no duplicate auto-acknowledgment bubble.\n  message_id:=null;\n');
 EXECUTE fn;
END;
$patch$;
