-- BANK-184: append-only Admin exception review evidence; this is NOT a collection.
-- Financial ledger is untouched until the separately guarded writer is approved.
CREATE TABLE IF NOT EXISTS public.chat_bank_manual_exception_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id bigint NOT NULL REFERENCES public.taphoa_agribank_notifications(id),
  primary_receipt_id uuid NOT NULL REFERENCES public.chat_bank_bill_receipts(id),
  supporting_receipt_ids uuid[] NOT NULL DEFAULT '{}',
  customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  admin_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  business_date date NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN (
    'missing_time','missing_date','missing_reference',
    'statement_multiple_rows','same_transaction_multiple_images','other')),
  explanation text NOT NULL CHECK (char_length(btrim(explanation)) BETWEEN 30 AND 2000),
  original_checked boolean NOT NULL CHECK(original_checked=true),
  evidence_state text NOT NULL CHECK(evidence_state IN (
    'evidence_reviewed_pending_collection','requires_additional_proof')),
  recorded_amount_vnd bigint NOT NULL,
  evidence_snapshot jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(notice_id,primary_receipt_id)
);
ALTER TABLE public.chat_bank_manual_exception_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_bank_manual_exception_reviews FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS chat_bank_manual_exception_review_day
 ON public.chat_bank_manual_exception_reviews(business_date,notice_id,recorded_at DESC);

CREATE OR REPLACE FUNCTION public.chat_bank_manual_exception_record(
  p_app_session_id uuid, p_notice_id bigint, p_primary_receipt_id uuid,
  p_supporting_receipt_ids uuid[], p_reason_code text,
  p_explanation text, p_original_checked boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','auth','pg_temp'
AS $bank184$
DECLARE
 v_admin uuid; v_notice public.taphoa_agribank_notifications%rowtype;
 v_receipt public.chat_bank_bill_receipts%rowtype;
 v_day date; v_state text; v_id uuid;
 v_count integer; v_supported uuid[];
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
    AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_original_checked IS DISTINCT FROM true OR length(btrim(coalesce(p_explanation,'')))<30
    OR length(btrim(p_explanation))>2000 OR p_reason_code NOT IN
    ('missing_time','missing_date','missing_reference',
     'statement_multiple_rows','same_transaction_multiple_images','other')
 THEN RAISE EXCEPTION 'explanation_and_original_required'; END IF;

 SELECT * INTO v_notice FROM public.taphoa_agribank_notifications
  WHERE id=p_notice_id;
 IF NOT FOUND OR v_notice.status<>'credit_candidate'
     OR v_notice.is_own_transfer IS DISTINCT FROM FALSE
     OR v_notice.bank_credit_account IS DISTINCT FROM '2901181999999'
     OR v_notice.package_name<>'com.vnpay.Agribank3g'
     OR coalesce(v_notice.body,'') ILIKE '%BUI XUAN TUNG chuyen tien%'
     OR v_notice.amount_vnd<=0 OR v_notice.transfer_at IS NULL
 THEN RAISE EXCEPTION 'bank_notice_not_eligible'; END IF;
 v_day:=(v_notice.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 SELECT * INTO v_receipt FROM public.chat_bank_bill_receipts
  WHERE id=p_primary_receipt_id;
 IF NOT FOUND OR v_receipt.status NOT IN ('review','amount_read')
    OR v_receipt.ledger_id IS NOT NULL
    OR v_receipt.customer_account_id IS NULL
    OR (v_receipt.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<>v_day
 THEN RAISE EXCEPTION 'bill_not_reviewable'; END IF;

 -- Ensure the receipt actually belongs to the customer and an original Chat
 -- image exists; no arbitrary account/receipt assignment via request fields.
 IF NOT EXISTS(
   SELECT 1 FROM public.v21_messages m
   JOIN public.v21_media_assets media ON media.id=v_receipt.media_asset_id
   JOIN public.v21_accounts a ON a.id=v_receipt.customer_account_id
   WHERE m.id=v_receipt.message_id AND m.sender_account_id=a.id
     AND m.deleted_at IS NULL AND media.message_id=m.id
     AND media.deleted_at IS NULL AND media.kind='image'
     AND media.owner_account_id=a.id AND a.role='user'
     AND a.contact_group='customer' AND a.deleted_at IS NULL
     AND a.locked_at IS NULL
 ) THEN RAISE EXCEPTION 'bill_owner_invalid'; END IF;
 IF EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links l
   WHERE l.notification_id=p_notice_id OR l.receipt_id=p_primary_receipt_id)
 THEN RAISE EXCEPTION 'already_collected'; END IF;
 IF EXISTS(SELECT 1 FROM public.chat_bank_manual_exception_reviews old
   WHERE old.notice_id=p_notice_id AND old.primary_receipt_id=p_primary_receipt_id)
 THEN RAISE EXCEPTION 'review_already_recorded'; END IF;

 -- All attachment IDs are validated, distinct, and same Chat customer.
 SELECT coalesce(array_agg(DISTINCT x.id),'{}'::uuid[])
 INTO v_supported FROM unnest(coalesce(p_supporting_receipt_ids,'{}'::uuid[])) x(id)
 WHERE x.id<>p_primary_receipt_id;
 IF cardinality(v_supported)>10 THEN RAISE EXCEPTION 'too_many_images'; END IF;
 SELECT count(*) INTO v_count FROM public.chat_bank_bill_receipts other
 WHERE other.id=ANY(v_supported) AND other.customer_account_id=v_receipt.customer_account_id
  AND (other.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=v_day
  AND other.status IN ('review','amount_read','duplicate')
  AND other.ledger_id IS NULL;
 IF v_count<>cardinality(v_supported) THEN RAISE EXCEPTION 'supporting_image_invalid'; END IF;

 v_state:=CASE WHEN v_receipt.amount_vnd=v_notice.amount_vnd
    AND v_receipt.raw_read->>'image_type'='successful_transfer_receipt'
    AND v_receipt.status='amount_read' THEN 'evidence_reviewed_pending_collection'
    ELSE 'requires_additional_proof' END;
 INSERT INTO public.chat_bank_manual_exception_reviews(
  notice_id,primary_receipt_id,supporting_receipt_ids,
  customer_account_id,admin_account_id,business_date,
  reason_code,explanation,original_checked,evidence_state,
  recorded_amount_vnd,evidence_snapshot
 ) VALUES(
  v_notice.id,v_receipt.id,v_supported,
  v_receipt.customer_account_id,v_admin,v_day,
  p_reason_code,btrim(p_explanation),true,v_state,
  v_notice.amount_vnd,
  jsonb_build_object('notice_id',v_notice.id,
   'bank_amount_vnd',v_notice.amount_vnd,'bank_transfer_at',v_notice.transfer_at,
   'bank_body',v_notice.body,'primary_receipt_id',v_receipt.id,
   'primary_image_sha256',v_receipt.image_sha256,
   'primary_status',v_receipt.status,
   'primary_amount_vnd',v_receipt.amount_vnd,
   'bill_sent_at',v_receipt.sent_at,
   'printed_bill_time',v_receipt.transfer_at_vn,
   'bill_reference',v_receipt.transfer_reference,
   'bill_original_read',v_receipt.raw_read,
   'supporting_receipt_ids',v_supported)
 ) RETURNING id INTO v_id;

 -- Explicitly never call chat_bank_app_collect or write debt/ledger/messages.
 RETURN jsonb_build_object('ok',true,'review_id',v_id,
    'state',v_state,'ledger_written',false,'notice_id',v_notice.id,
    'receipt_id',v_receipt.id,'amount_vnd',v_notice.amount_vnd,
    'recorded_at',clock_timestamp());
END;
$bank184$;
REVOKE ALL ON FUNCTION public.chat_bank_manual_exception_record(uuid,bigint,uuid,uuid[],text,text,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_manual_exception_record(uuid,bigint,uuid,uuid[],text,text,boolean)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_bank_manual_exception_get(
 p_app_session_id uuid,p_notice_id bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','auth','pg_temp'
AS $bank184get$
DECLARE v_admin uuid; v_reviews jsonb;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
    AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'review_id',r.id,'reason_code',r.reason_code,
  'explanation',r.explanation,'evidence_state',r.evidence_state,
  'recorded_at',r.recorded_at,'admin_account_id',r.admin_account_id,
  'customer_account_id',r.customer_account_id,
  'primary_receipt_id',r.primary_receipt_id,
  'supporting_receipt_ids',r.supporting_receipt_ids,
  'ledger_written',false) ORDER BY r.recorded_at DESC),'[]'::jsonb)
 INTO v_reviews FROM public.chat_bank_manual_exception_reviews r
 WHERE r.notice_id=p_notice_id;
 RETURN jsonb_build_object('notice_id',p_notice_id,'reviews',v_reviews);
END;
$bank184get$;
REVOKE ALL ON FUNCTION public.chat_bank_manual_exception_get(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_manual_exception_get(uuid,bigint) TO authenticated;
