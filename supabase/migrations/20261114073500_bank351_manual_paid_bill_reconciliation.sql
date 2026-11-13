-- BANK-351: explicit Admin reconciliation of a previously booked manual Agribank
-- credit with a customer bill. Does NOT create or edit a debt ledger entry.
-- Conflicting OCR date/account is NEVER silently accepted; Admin must inspect
-- the original image and independently verify the bank credit before signing.
BEGIN;
CREATE OR REPLACE FUNCTION public.chat_bank_confirm_existing_manual_bill(
 p_app_session_id uuid,
 p_receipt_id uuid,
 p_notice_id bigint,
 p_original_checked boolean,
 p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','auth','pg_temp'
AS $bank351$
DECLARE
 v_admin uuid;
 v_receipt public.chat_bank_bill_receipts%ROWTYPE;
 v_notice public.taphoa_agribank_notifications%ROWTYPE;
 v_manual public.chat_bank_manual_collections%ROWTYPE;
 v_ledger public.taphoa_debt_ledger%ROWTYPE;
 v_note text:=btrim(coalesce(p_note,''));
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts a
   WHERE a.id=v_admin AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_receipt_id IS NULL OR p_notice_id IS NULL OR p_original_checked IS DISTINCT FROM TRUE
    OR length(v_note) NOT BETWEEN 25 AND 1000
 THEN RETURN jsonb_build_object('ok',false,'status','review_evidence_required'); END IF;

 -- The same serialization lock as BANK-310 and manual bank collection.
 PERFORM pg_advisory_xact_lock(17812026);
 SELECT * INTO v_receipt FROM public.chat_bank_bill_receipts
  WHERE id=p_receipt_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status','bill_not_found'); END IF;
 IF v_receipt.status='received' AND v_receipt.ledger_id IS NOT NULL THEN
  RETURN jsonb_build_object('ok',false,'status','bill_already_collected','ledger_id',v_receipt.ledger_id);
 END IF;
 IF v_receipt.status NOT IN ('review','amount_read')
    OR v_receipt.ledger_id IS NOT NULL OR v_receipt.duplicate_of IS NOT NULL
    OR v_receipt.amount_vnd IS NULL OR v_receipt.amount_vnd<1000
    OR mod(v_receipt.amount_vnd,1000)<>0
    OR v_receipt.image_sha256 IS NULL OR v_receipt.scanned_at IS NULL
    OR v_receipt.customer_account_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'status','bill_not_eligible'); END IF;

 SELECT * INTO v_notice FROM public.taphoa_agribank_notifications n
 WHERE n.id=p_notice_id AND n.is_own_transfer IS FALSE
   AND n.bank_credit_account='2901181999999'
   AND n.amount_vnd=v_receipt.amount_vnd AND n.transfer_at IS NOT NULL
 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status','bank_evidence_mismatch'); END IF;
 -- Bill's CHAT send day must be the bank credit day; OCR printed day is
 -- NOT silently rewritten or treated as truth. Conflicts stay in the audit note.
 IF (v_receipt.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    <> (v_notice.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR v_receipt.sent_at<v_notice.transfer_at-interval '12 hours'
    OR v_receipt.sent_at>v_notice.transfer_at+interval '24 hours'
 THEN RETURN jsonb_build_object('ok',false,'status','bank_bill_day_or_time_mismatch'); END IF;

 SELECT * INTO v_manual FROM public.chat_bank_manual_collections m
  WHERE m.notification_id=p_notice_id FOR UPDATE;
 IF NOT FOUND OR v_manual.customer_account_id<>v_receipt.customer_account_id
    OR v_manual.ledger_id IS NULL OR v_manual.mode NOT IN ('collected','linked_existing')
 THEN RETURN jsonb_build_object('ok',false,'status','manual_collection_not_verified'); END IF;
 SELECT * INTO v_ledger FROM public.taphoa_debt_ledger l WHERE l.id=v_manual.ledger_id FOR UPDATE;
 IF NOT FOUND OR v_ledger.customer_account_id<>v_receipt.customer_account_id
    OR v_ledger.entry_type<>'collection'
    OR v_ledger.amount_vnd<>-(v_receipt.amount_vnd::numeric/1000)
 THEN RETURN jsonb_build_object('ok',false,'status','existing_ledger_mismatch'); END IF;
 -- A booked ledger and a distinct bill may never be linked twice.
 IF EXISTS(SELECT 1 FROM public.chat_bank_bill_manual_collections m
   WHERE m.receipt_id=v_receipt.id OR m.ledger_id=v_manual.ledger_id)
 OR EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links l
   WHERE l.receipt_id=v_receipt.id OR l.ledger_id=v_manual.ledger_id
       OR l.notification_id=p_notice_id)
 OR EXISTS(SELECT 1 FROM public.chat_bank_bill_receipts r
   WHERE r.id<>v_receipt.id AND r.status='received' AND r.ledger_id=v_manual.ledger_id)
 THEN RETURN jsonb_build_object('ok',false,'status','collection_already_linked'); END IF;
 -- Avoid arbitrarily selecting one of multiple same-customer same-amount bills.
 IF EXISTS(SELECT 1 FROM public.chat_bank_bill_receipts other
  WHERE other.id<>v_receipt.id AND other.customer_account_id=v_receipt.customer_account_id
    AND other.amount_vnd=v_receipt.amount_vnd
    AND other.status IN ('review','amount_read','received')
    AND other.duplicate_of IS NULL
    AND (other.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date =
        (v_receipt.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
 THEN RETURN jsonb_build_object('ok',false,'status','ambiguous_competing_bill'); END IF;

 INSERT INTO public.chat_bank_bill_manual_collections
 (receipt_id,ledger_id,customer_account_id,confirmed_by,mode,note)
 VALUES(v_receipt.id,v_manual.ledger_id,v_receipt.customer_account_id,v_admin,'linked_existing',
  'Đã xem bill gốc, đối soát với Agribank #'||p_notice_id::text||
  ', sổ #'||v_manual.ledger_id::text||'. '||left(v_note,800));
 UPDATE public.chat_bank_bill_receipts SET
  status='received',reason='manual_bank_bill_reviewed',ledger_id=v_manual.ledger_id
 WHERE id=v_receipt.id AND ledger_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'bank351_reconcile_race'; END IF;
 -- Keep the ORIGINAL OCR image, fields and printed date intact for audit.
 -- No INSERT into taphoa_debt_ledger, no payment, no outbound notification.
 PERFORM v21_private.chat_bank_report_touch();
 RETURN jsonb_build_object('ok',true,'status','manual_bill_reviewed',
  'receipt_id',v_receipt.id,'notice_id',p_notice_id,'ledger_id',v_manual.ledger_id,
  'debt_changed',false,'notice_sent',false);
END;
$bank351$;
REVOKE ALL ON FUNCTION public.chat_bank_confirm_existing_manual_bill(uuid,uuid,bigint,boolean,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_confirm_existing_manual_bill(uuid,uuid,bigint,boolean,text)
 TO authenticated;
COMMIT;
