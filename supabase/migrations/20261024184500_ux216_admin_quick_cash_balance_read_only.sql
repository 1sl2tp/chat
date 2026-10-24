-- UX-216: Dedicated, read-only Admin customer balance for manual CASH dialog.
-- Deliberately does NOT call debt_share_summary_payload: that function generates
-- customer links via get_or_create, which writes in a STABLE read-only RPC (HTTP 405).
-- taphoa_debt_ledger.amount_vnd is stored in thousands, so convert exactly once.
CREATE OR REPLACE FUNCTION public.chat_admin_quick_cash_balance(
  p_app_session_id uuid,
  p_customer_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,v21_private,auth,pg_temp
AS $ux216$
DECLARE
  v_actor uuid;
  v_balance_thousands numeric;
BEGIN
  v_actor:=v21_private.require_active_account(p_app_session_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.v21_accounts a
    WHERE a.id=v_actor
      AND a.role='admin'
      AND a.deleted_at IS NULL
      AND a.locked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE='42501';
  END IF;

  IF p_customer_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.v21_accounts a
    WHERE a.id=p_customer_id
      AND a.role='user'
      AND a.contact_group='customer'
      AND a.deleted_at IS NULL
      AND a.locked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'customer_invalid' USING ERRCODE='22023';
  END IF;

  v_balance_thousands:=public.taphoa_chat_customer_balance_value(p_customer_id);
  RETURN jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id::text,
    'balance',v_balance_thousands,
    'balance_vnd',v_balance_thousands*1000,
    'unit','VND',
    'checked_at',transaction_timestamp()
  );
END;
$ux216$;

REVOKE ALL ON FUNCTION public.chat_admin_quick_cash_balance(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_admin_quick_cash_balance(uuid,uuid)
  TO authenticated;
