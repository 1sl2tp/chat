-- BANK-315: Admin-only, READ-ONLY projection of already-parsed evidence.
-- Never changes bills, notices, ledger, any status, or auto-collection rules.
-- Two pre-existing Admin session-scoped RPCs supply the comparison dialog.
-- NO production migration deployment from this PR.
BEGIN;

DO $bank315_admin_projection$
DECLARE
 v_dashboard text;
 v_credits text;
 v_new text;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_dashboard(uuid,date)'::regprocedure)
 INTO v_dashboard;
 IF v_dashboard IS NULL THEN
   RAISE EXCEPTION 'bank315_dashboard_function_missing'; END IF;
 IF position('r.raw_read AS bill_ocr' IN v_dashboard)=0 THEN
   v_new:=replace(v_dashboard,
     'r.receiving_account, r.transfer_reference,',
     'r.receiving_account, r.receiving_name, r.raw_read AS bill_ocr, r.transfer_reference,');
   IF v_new=v_dashboard THEN
     RAISE EXCEPTION 'bank315_dashboard_contract_changed'; END IF;
   EXECUTE v_new;
 END IF;

 SELECT pg_get_functiondef('public.chat_bank_all_credit_statuses(uuid,date)'::regprocedure)
 INTO v_credits;
 IF v_credits IS NULL THEN
   RAISE EXCEPTION 'bank315_credit_status_function_missing'; END IF;
 IF position('n.body AS bank_body' IN v_credits)=0 THEN
   v_new:=replace(v_credits,
     'n.bank_credit_account,',
     'n.bank_credit_account, n.body AS bank_body, '||
      'n.fingerprint AS bank_fingerprint, '||
      'n.received_at AS bank_received_at,');
   IF v_new=v_credits THEN
     RAISE EXCEPTION 'bank315_credit_status_contract_changed'; END IF;
   EXECUTE v_new;
 END IF;
END;
$bank315_admin_projection$;

-- No new grant: the original functions' Admin-only session checks,
-- security labels, RLS policy and existing EXECUTE grants remain intact.
COMMIT;
