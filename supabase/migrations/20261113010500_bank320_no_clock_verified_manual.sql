-- BANK-320: a bill with printed date but no printed clock may be manually
-- verified against a UNIQUE authentic Agribank credit. Never autofill the
-- bill clock and never auto-collect based on OCR alone.
BEGIN;
CREATE OR REPLACE FUNCTION v21_private.bank320_unique_credit_for_no_clock(p_receipt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','v21_private','extensions','pg_temp'
AS $bank320$
DECLARE
 r public.chat_bank_bill_receipts%rowtype;
 v_memo text;
 v_fingerprints integer;
 v_notice bigint;
 v_time timestamptz;
 v_fp text;
BEGIN
 SELECT * INTO r FROM public.chat_bank_bill_receipts WHERE id=p_receipt_id;
 IF NOT FOUND OR r.status NOT IN ('review','amount_read')
 OR r.reason IS DISTINCT FROM 'bill_printed_time_missing'
 OR r.transfer_at_vn IS NOT NULL OR r.ledger_id IS NOT NULL
 OR r.duplicate_of IS NOT NULL OR r.amount_vnd IS NULL OR r.amount_vnd<1000
 OR mod(r.amount_vnd,1000)<>0 OR r.receiving_account<>'2901181999999'
 OR upper(regexp_replace(btrim(coalesce(r.receiving_name,'')),'[[:space:]]+',' ','g'))<>'BUI XUAN TUNG'
 OR r.image_sha256 IS NULL OR r.scanned_at IS NULL OR r.model_name IS NULL
 OR r.raw_read->>'transfer_success_visible' IS DISTINCT FROM 'true'
 OR r.raw_read->>'amount_clear' IS DISTINCT FROM 'true'
 OR nullif(r.raw_read->>'transfer_time_printed_vn','') IS NOT NULL
 OR coalesce(r.raw_read->>'transfer_date_vn','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
 THEN RETURN jsonb_build_object('ok',false,'status','bill_no_clock_not_eligible'); END IF;
 v_memo:=upper(regexp_replace(extensions.unaccent(coalesce(r.raw_read->>'transfer_content','')),
   '[^A-Za-z0-9]','','g'));
 IF length(v_memo)<8 THEN RETURN jsonb_build_object('ok',false,'status','bill_memo_missing'); END IF;
 SELECT count(DISTINCT n.fingerprint)::integer,min(n.id),min(n.transfer_at)
 INTO v_fingerprints,v_notice,v_time
 FROM public.taphoa_agribank_notifications n
 WHERE n.package_name='com.vnpay.Agribank3g'
 AND n.status='credit_candidate' AND n.is_own_transfer=false
 AND n.amount_vnd=r.amount_vnd AND n.bank_credit_account=r.receiving_account
 AND n.transfer_at IS NOT NULL
 AND n.fingerprint ~ '^[0-9a-f]{64}$'
 AND (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(r.raw_read->>'transfer_date_vn')::date
 AND upper(regexp_replace(extensions.unaccent(btrim(split_part(
   split_part(n.body,'Nội dung giao dịch:',2),'Số dư cuối:',1))),
   '[^A-Za-z0-9]','','g'))=v_memo;
 IF v_fingerprints<>1 OR v_notice IS NULL THEN
  RETURN jsonb_build_object('ok',false,'status',
    CASE WHEN v_fingerprints=0 THEN 'no_verified_bank_credit' ELSE 'ambiguous_bank_credit' END);
 END IF;
 SELECT fingerprint INTO v_fp FROM public.taphoa_agribank_notifications WHERE id=v_notice;
 IF EXISTS(SELECT 1 FROM public.taphoa_agribank_notifications x
  WHERE x.fingerprint=v_fp AND (
   EXISTS(SELECT 1 FROM public.chat_bank_manual_collections m WHERE m.notification_id=x.id)
   OR EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links a WHERE a.notification_id=x.id)
  )) THEN RETURN jsonb_build_object('ok',false,'status','bank_credit_already_collected'); END IF;
 RETURN jsonb_build_object('ok',true,'notice_id',v_notice,'bank_time_vn',
  (v_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::text,
  'fingerprint',v_fp,'proof','exact_day_account_amount_bank_memo_unique_fingerprint');
END;
$bank320$;
REVOKE ALL ON FUNCTION v21_private.bank320_unique_credit_for_no_clock(uuid)
FROM PUBLIC,anon,authenticated;

-- Extend the existing BANK-310 Admin-signed collection RPC without changing
-- its name/arguments. Use a local BANK clock solely for the manual verification
-- time window. Store NO invented transfer_at_vn on the customer bill.
DO $bank320_patch$
DECLARE
 source text;
 edited text;
 declaration text := 'v_notice_text text;';
 eligibility text := 'IF v_r.status NOT IN';
 bill_anchor text := 'INSERT INTO public.chat_bank_bill_manual_collections';
 new_fields text := E'v_notice_text text;\n v_effective_time timestamp without time zone;\n v_bank_proof jsonb;';
 setup text := $setup$
 v_effective_time:=v_r.transfer_at_vn;
 IF v_effective_time IS NULL THEN
   v_bank_proof:=v21_private.bank320_unique_credit_for_no_clock(v_r.id);
   IF coalesce((v_bank_proof->>'ok')::boolean,false)=false THEN RETURN v_bank_proof; END IF;
   v_effective_time:=(v_bank_proof->>'bank_time_vn')::timestamp;
 END IF;
$setup$;
 manual_link text := $link$
 IF v_bank_proof IS NOT NULL THEN
   -- The fingerprint belongs to exactly ONE verified bank transaction; record
   -- its canonical notice as manually collected in the same atomic operation.
   INSERT INTO public.chat_bank_manual_collections
     (notification_id,customer_account_id,ledger_id,mode,note,confirmed_by)
   VALUES ((v_bank_proof->>'notice_id')::bigint,p_customer_id,v_id,v_mode,
     btrim(p_note),v_admin);
 END IF;
$link$;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_bill_manual_collect(uuid,uuid,uuid,text,bigint)'::regprocedure)
 INTO source;
 IF position('v_bank_proof jsonb' IN source)>0 THEN RETURN; END IF;
 IF position(declaration IN source)=0 OR position(eligibility IN source)=0
   OR position(bill_anchor IN source)=0 OR
   (length(source)-length(replace(source,'v_r.transfer_at_vn','')))/length('v_r.transfer_at_vn')<>8
 THEN RAISE EXCEPTION 'bank320_bank310_contract_changed'; END IF;
 edited:=replace(source,'v_r.transfer_at_vn','v_effective_time');
 edited:=replace(edited,declaration,new_fields);
 edited:=replace(edited,eligibility,setup||E'\n'||eligibility);
 edited:=replace(edited,bill_anchor,manual_link||E'\n'||bill_anchor);
 EXECUTE edited;
END;
$bank320_patch$;

-- Even if the Android service retransmits the same credit as a separate row,
-- neither the Admin bank collector nor the automatic collector may book it again.
DO $bank320_global_fingerprint_guard$
DECLARE
 manual_src text;
 auto_src text;
 manual_anchor text:='SELECT * INTO v_existing FROM public.chat_bank_manual_collections WHERE notification_id=p_notice_id;';
 auto_anchor text:='image_at:=r.transfer_at_vn at time zone ''Asia/Ho_Chi_Minh'';';
 manual_guard text := $g1$
 IF v_notice.fingerprint IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.taphoa_agribank_notifications x
   WHERE x.fingerprint=v_notice.fingerprint AND (
    EXISTS(SELECT 1 FROM public.chat_bank_manual_collections m WHERE m.notification_id=x.id)
    OR EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links a WHERE a.notification_id=x.id))
 ) THEN RETURN jsonb_build_object('ok',false,'status','bank_fingerprint_already_collected'); END IF;
$g1$;
 auto_guard text := $g2$
 IF n.fingerprint IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.taphoa_agribank_notifications x
   WHERE x.fingerprint=n.fingerprint AND (
    EXISTS(SELECT 1 FROM public.chat_bank_manual_collections m WHERE m.notification_id=x.id)
    OR EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links a WHERE a.notification_id=x.id))
 ) THEN RETURN jsonb_build_object('ok',false,'status','bank_fingerprint_already_collected'); END IF;
$g2$;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_manual_collect(uuid,bigint,uuid,text,bigint)'::regprocedure)
 INTO manual_src;
 IF position('bank_fingerprint_already_collected' IN manual_src)=0 THEN
  IF position(manual_anchor IN manual_src)=0 THEN RAISE EXCEPTION 'bank320_manual_guard_anchor_changed'; END IF;
  EXECUTE replace(manual_src,manual_anchor,manual_guard||E'\n'||manual_anchor);
 END IF;
 SELECT pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure)
 INTO auto_src;
 IF position('bank_fingerprint_already_collected' IN auto_src)=0 THEN
  IF position(auto_anchor IN auto_src)=0 THEN RAISE EXCEPTION 'bank320_auto_guard_anchor_changed'; END IF;
  EXECUTE replace(auto_src,auto_anchor,auto_guard||E'\n'||auto_anchor);
 END IF;
END;
$bank320_global_fingerprint_guard$;
NOTIFY pgrst,'reload schema';
COMMIT;