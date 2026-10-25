-- BANK-222: read-only Admin dashboard register for all incoming Agribank Plus credits.
-- Preserve linked automatic and manual records; no financial ledger mutation.
CREATE OR REPLACE FUNCTION public.chat_bank_all_credit_statuses(p_app_session_id uuid, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth', 'pg_temp'
AS $function$
DECLARE v_admin uuid;v_rows jsonb;v_today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
    AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_day<date '2026-10-19' OR p_day>v_today THEN RAISE EXCEPTION 'date_out_of_range'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.transfer_at,x.notice_id),'[]'::jsonb)
 INTO v_rows FROM(
 SELECT n.id::text notice_id,n.amount_vnd,n.transfer_at,
    (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::text bank_time,
    n.bank_credit_account,
    CASE WHEN l.ledger_id IS NOT NULL AND d.id IS NOT NULL AND r.status='received' THEN 'auto_collected'
         WHEN mc.ledger_id IS NOT NULL AND md.id IS NOT NULL THEN 'manual_collected'
         WHEN l.ledger_id IS NOT NULL OR mc.ledger_id IS NOT NULL THEN 'review_inconsistent'
         ELSE 'unmatched' END collection_kind,
    coalesce(r.customer_account_id,mc.customer_account_id)::text customer_id,
    coalesce(aa.display_name,ma.display_name) customer_name,
    coalesce(l.ledger_id,mc.ledger_id)::text ledger_id,
    r.id::text receipt_id,r.media_asset_id::text asset_id
 FROM public.taphoa_agribank_notifications n
 LEFT JOIN public.chat_bank_app_collection_links l ON l.notification_id=n.id
 LEFT JOIN public.chat_bank_bill_receipts r ON r.id=l.receipt_id
 LEFT JOIN public.taphoa_debt_ledger d ON d.id=l.ledger_id AND d.customer_account_id=r.customer_account_id
     AND d.entry_type='collection' AND d.amount_vnd=-(n.amount_vnd::numeric/1000)
 LEFT JOIN public.chat_bank_manual_collections mc ON mc.notification_id=n.id
 LEFT JOIN public.taphoa_debt_ledger md ON md.id=mc.ledger_id
     AND md.customer_account_id=mc.customer_account_id AND md.entry_type='collection'
     AND md.amount_vnd=-(n.amount_vnd::numeric/1000)
 LEFT JOIN public.v21_accounts aa ON aa.id=r.customer_account_id
 LEFT JOIN public.v21_accounts ma ON ma.id=mc.customer_account_id
 WHERE n.is_own_transfer IS FALSE AND n.bank_credit_account='2901181999999'
   AND n.status='credit_candidate'
   AND (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day
 ORDER BY n.transfer_at DESC LIMIT 200
 ) x;
 RETURN v_rows;
END;
$function$
;
REVOKE ALL ON FUNCTION public.chat_bank_all_credit_statuses(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_all_credit_statuses(uuid,date) TO authenticated;
