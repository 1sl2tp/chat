-- BANK-177: Admin-only live reconciliation dashboard. Stop per-event Chat report messages.
-- All values are read-only canonical Supabase data. No financial ledger writes.
CREATE OR REPLACE FUNCTION public.chat_bank_dashboard(p_app_session_id uuid,p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,auth,pg_temp AS $$
DECLARE v_account uuid; v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 v_summary jsonb; v_rows jsonb; v_bank_only jsonb; v_closed jsonb;
BEGIN
 v_account:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts WHERE id=v_account AND role='admin' AND deleted_at IS NULL AND locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_day<date '2026-10-19' OR p_day>v_today THEN RAISE EXCEPTION 'date_out_of_range'; END IF;
 SELECT snapshot INTO v_closed FROM public.chat_bank_daily_reports WHERE business_date=p_day;
 v_summary:=coalesce(v_closed,v21_private.chat_bank_report_snapshot(p_day));
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sent_at DESC,x.receipt_id),'[]'::jsonb) INTO v_rows FROM (
 SELECT r.id::text receipt_id, r.media_asset_id::text asset_id,r.message_id::text message_id,
 r.customer_account_id::text customer_id,a.display_name customer_name,
 r.sent_at,r.transfer_at_vn::text bill_time,r.amount_vnd,r.status,r.reason,
 coalesce(r.duplicate_of::text,'') duplicate_of,
 n.id::text notice_id, n.amount_vnd bank_amount,
 (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::text bank_time,
 r.receiving_account, r.transfer_reference,
 CASE
  WHEN n.id IS NOT NULL AND n.is_own_transfer IS TRUE THEN 'test_excluded'
  WHEN n.id IS NOT NULL AND r.status='received' THEN 'matched'
  WHEN r.status='duplicate' THEN 'duplicate'
  WHEN r.transfer_at_vn IS NOT NULL AND r.transfer_at_vn::date<>p_day THEN 'wrong_day'
  WHEN r.status='non_bill' THEN 'non_bill'
  WHEN r.status='review' THEN 'review'
  WHEN r.status='amount_read' AND r.transfer_at_vn::date=p_day THEN 'waiting_bank'
  WHEN r.status IN ('queued','scanning') THEN 'reading'
  ELSE 'review' END report_status
 FROM public.chat_bank_bill_receipts r
 JOIN public.v21_accounts a ON a.id=r.customer_account_id
 LEFT JOIN public.chat_bank_app_collection_links l ON l.receipt_id=r.id
 LEFT JOIN public.taphoa_agribank_notifications n ON n.id=l.notification_id
 WHERE (r.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day
 ORDER BY r.sent_at DESC LIMIT 500
 ) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.transfer_at DESC,x.notice_id),'[]'::jsonb)
 INTO v_bank_only FROM (
 SELECT n.id::text notice_id,n.amount_vnd,
 n.transfer_at,
 (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::text bank_time,
 n.bank_credit_account,n.status
 FROM public.taphoa_agribank_notifications n
 WHERE n.is_own_transfer IS FALSE AND n.bank_credit_account='2901181999999'
  AND n.status='credit_candidate'
  AND (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day
  AND NOT EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links l WHERE l.notification_id=n.id)
 ORDER BY n.transfer_at DESC LIMIT 200
 ) x;
 RETURN jsonb_build_object('date',p_day,'closed',v_closed IS NOT NULL,
  'updated_at',now(),'summary',v_summary,'bills',v_rows,'bank_only',v_bank_only);
END;
$$;
REVOKE ALL ON FUNCTION public.chat_bank_dashboard(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_bank_dashboard(uuid,date) TO authenticated;

-- Reuse a single existing signal message, UPDATE it rather than append another Chat report.
CREATE OR REPLACE FUNCTION v21_private.chat_bank_report_touch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,v21_private,pg_temp AS $$
DECLARE sid uuid; msg_id uuid;
BEGIN
 SELECT id INTO sid FROM public.v21_accounts WHERE username='taphoa_bao_cao' AND auth_user_id IS NULL LIMIT 1;
 IF sid IS NULL THEN RETURN; END IF;
 SELECT id INTO msg_id FROM public.v21_messages
 WHERE sender_account_id=sid AND client_id='taphoa:bank-report:2026-10-19:initial'
 LIMIT 1;
 IF msg_id IS NULL THEN RETURN; END IF;
 UPDATE public.v21_messages
 SET body='📊 Bảng đối soát trực tiếp · cập nhật '||
   to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI:SS')
 WHERE id=msg_id;
END;
$$;
REVOKE ALL ON FUNCTION v21_private.chat_bank_report_touch() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.chat_bank_report_on_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,v21_private,pg_temp AS $$
BEGIN
 IF new.status='credit_candidate' AND new.is_own_transfer IS FALSE AND new.bank_credit_account='2901181999999'
 THEN PERFORM v21_private.chat_bank_report_touch(); END IF;
 RETURN new;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'bank_dashboard_wake_notice_skipped %',SQLSTATE;
 RETURN new;
END;
$$;
CREATE OR REPLACE FUNCTION v21_private.chat_bank_report_on_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,v21_private,pg_temp AS $$
BEGIN
 -- Receipt status update after this link is written is the canonical dashboard wake.
 RETURN new;
END;
$$;
CREATE OR REPLACE FUNCTION v21_private.chat_bank_report_on_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,v21_private,pg_temp AS $$
BEGIN
 IF new.status IS DISTINCT FROM old.status THEN
  PERFORM v21_private.chat_bank_report_touch();
 END IF;
 RETURN new;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'bank_dashboard_wake_receipt_skipped %',SQLSTATE;
 RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS chat_bank_report_receipt_status_trg ON public.chat_bank_bill_receipts;
CREATE TRIGGER chat_bank_report_receipt_status_trg
AFTER UPDATE OF status ON public.chat_bank_bill_receipts
FOR EACH ROW EXECUTE FUNCTION v21_private.chat_bank_report_on_receipt();

-- Midnight continues to save the immutable day snapshot and notify customers
-- about truly outstanding valid bills, but no longer appends a report Chat bubble.
DO $block$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('v21_private.chat_bank_report_close()'::regprocedure) INTO definition;
 definition:=replace(definition,
  'v_id:=v21_private.chat_bank_report_send(d,''close'',''close'',NULL);',
  'PERFORM v21_private.chat_bank_report_touch();');
 IF definition NOT LIKE '%PERFORM v21_private.chat_bank_report_touch();%' THEN
 RAISE EXCEPTION 'midnight_patch_anchor_missing'; END IF;
 EXECUTE definition;
END;
$block$;
