-- BANK-307: add bank proof identity and ingestion time to the already
-- Admin-session-protected, READ-ONLY bank-credit registry.
-- Applies whether or not BANK-306's canonical query has been deployed yet.
-- No changes to customer debt ledger or original bank notifications.
BEGIN;
DO $bank307$
DECLARE
  def text;
  changed text;
  original text := 'SELECT n.id::text notice_id,n.amount_vnd,n.transfer_at,';
  replacement text := 'SELECT n.id::text notice_id,n.amount_vnd,n.transfer_at,n.fingerprint,n.received_at,';
BEGIN
  SELECT pg_get_functiondef('public.chat_bank_all_credit_statuses(uuid,date)'::regprocedure)
    INTO def;
  IF position('n.fingerprint,n.received_at' IN def)>0 THEN RETURN; END IF;
  IF position(original IN def)=0 THEN
    RAISE EXCEPTION 'bank307_admin_credit_rpc_contract_changed';
  END IF;
  changed:=replace(def,original,replacement);
  EXECUTE changed;
END;
$bank307$;
-- Existing revoke/grant on the preserved Admin RPC remains unchanged.
COMMIT;
