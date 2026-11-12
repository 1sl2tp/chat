-- BANK-310: explicit Admin manual collection directly FROM a scanned customer bill,
-- even when Agribank Android notification was missing at collection time.
-- Guard against the SAME bill or a later-arriving bank notice creating
-- a second ledger movement. No existing customer ledger rows are changed.
-- Deployed only via approved migration pipeline. No changes from this file
-- are applied to production merely by merging the repository branch.
BEGIN;
CREATE TABLE IF NOT EXISTS public.chat_bank_bill_manual_collections (
  receipt_id uuid PRIMARY KEY REFERENCES public.chat_bank_bill_receipts(id),
  ledger_id bigint NOT NULL UNIQUE REFERENCES public.taphoa_debt_ledger(id),
  customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  confirmed_by uuid NOT NULL REFERENCES public.v21_accounts(id),
  mode text NOT NULL CHECK(mode IN ('collected','linked_existing')),
  note text NOT NULL CHECK(length(btrim(note)) BETWEEN 5 AND 1000),
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_bank_bill_manual_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_bank_bill_manual_collections FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS bank310_manual_bill_customer_time
  ON public.chat_bank_bill_manual_collections(customer_account_id,confirmed_at DESC);

CREATE OR REPLACE FUNCTION public.chat_bank_bill_manual_prepare(
  p_app_session_id uuid, p_receipt_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public','v21_private','auth','pg_temp'
AS $bank310_prepare$
DECLARE
  v_admin uuid;
  v_receipt public.chat_bank_bill_receipts%rowtype;
  v_customer text;
  v_record jsonb;
  v_possible jsonb;
BEGIN
  v_admin:=v21_private.require_active_account(p_app_session_id);
  IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
    AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
  THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_receipt FROM public.chat_bank_bill_receipts WHERE id=p_receipt_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status','bill_not_found'); END IF;
  SELECT display_name INTO v_customer FROM public.v21_accounts
    WHERE id=v_receipt.customer_account_id AND role='user'
      AND contact_group='customer' AND deleted_at IS NULL AND locked_at IS NULL;
  IF v_customer IS NULL THEN RETURN jsonb_build_object('ok',false,'status','customer_invalid'); END IF;
  SELECT to_jsonb(m) INTO v_record FROM (
    SELECT x.receipt_id,x.ledger_id,x.mode,x.confirmed_at,x.note
    FROM public.chat_bank_bill_manual_collections x WHERE x.receipt_id=p_receipt_id
  ) m;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]'::jsonb)
    INTO v_possible FROM (
    SELECT l.id::text AS ledger_id, l.note,
      l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS created_at
    FROM public.taphoa_debt_ledger l
    WHERE l.customer_account_id=v_receipt.customer_account_id
      AND l.entry_type='collection'
      AND l.amount_vnd=-(v_receipt.amount_vnd::numeric/1000)
      AND l.created_at BETWEEN
        (v_receipt.transfer_at_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')-interval '12 hours'
        AND (v_receipt.transfer_at_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '7 days'
      AND l.note NOT ILIKE 'Chuyển khoản tự động%'
      AND NOT EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links c WHERE c.ledger_id=l.id)
      AND NOT EXISTS(SELECT 1 FROM public.chat_bank_manual_collections c WHERE c.ledger_id=l.id)
      AND NOT EXISTS(SELECT 1 FROM public.chat_bank_bill_manual_collections c WHERE c.ledger_id=l.id)
    ORDER BY l.created_at DESC LIMIT 25
  ) t;
  RETURN jsonb_build_object(
    'ok',true,'receipt_id',v_receipt.id,'customer_id',v_receipt.customer_account_id,
    'customer_name',v_customer,'amount_vnd',v_receipt.amount_vnd,
    'status',v_receipt.status,'ledger_id',v_receipt.ledger_id,
    'bank_notice_present',EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links l
      WHERE l.receipt_id=v_receipt.id),
    'recorded',v_record,'possible_existing',v_possible
  );
END;
$bank310_prepare$;
REVOKE ALL ON FUNCTION public.chat_bank_bill_manual_prepare(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_bill_manual_prepare(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_bank_bill_manual_collect(
  p_app_session_id uuid,p_receipt_id uuid,p_customer_id uuid,p_note text,
  p_existing_ledger_id bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO 'public','v21_private','auth','pg_temp'
AS $bank310_collect$
DECLARE
 v_admin uuid;
 v_r public.chat_bank_bill_receipts%rowtype;
 v_ledger public.taphoa_debt_ledger%rowtype;
 v_id bigint;
 v_before numeric;
 v_after numeric;
 v_thousands numeric;
 v_note text;
 v_mode text;
 v_notice_text text;
 v_message_id uuid;
 v_url text;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin AND a.role='admin'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_receipt_id IS NULL OR p_customer_id IS NULL
 THEN RETURN jsonb_build_object('ok',false,'status','missing_receipt_or_customer'); END IF;
 IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 15 AND 1000 OR
    position('Agribank' in p_note)=0
 THEN RETURN jsonb_build_object('ok',false,'status','bank_verification_note_required'); END IF;
 -- Same global lock used by Agribank auto and manual collection.
 PERFORM pg_advisory_xact_lock(17812026);
 SELECT * INTO v_r FROM public.chat_bank_bill_receipts WHERE id=p_receipt_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status','bill_not_found'); END IF;
 IF v_r.customer_account_id IS DISTINCT FROM p_customer_id OR
   NOT EXISTS (SELECT 1 FROM public.v21_accounts a WHERE a.id=p_customer_id
    AND a.role='user' AND a.contact_group='customer' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'status','customer_mismatch'); END IF;
 IF v_r.status='received' AND v_r.ledger_id IS NOT NULL THEN
   RETURN jsonb_build_object('ok',false,'status','bill_already_collected',
     'ledger_id',v_r.ledger_id);
 END IF;
 IF v_r.status NOT IN ('amount_read','review') OR v_r.ledger_id IS NOT NULL OR
    v_r.duplicate_of IS NOT NULL OR v_r.amount_vnd IS NULL OR v_r.amount_vnd<1000 OR
    v_r.amount_vnd>=1000000000000 OR mod(v_r.amount_vnd,1000)<>0 OR
    v_r.transfer_at_vn IS NULL OR v_r.transfer_at_vn>now() AT TIME ZONE 'Asia/Ho_Chi_Minh' OR
    v_r.image_sha256 IS NULL OR v_r.scanned_at IS NULL OR v_r.model_name IS NULL OR
    v_r.raw_read->>'transfer_success_visible'<>'true' OR
    v_r.raw_read->>'amount_clear'<>'true' OR
    v_r.receiving_account IS DISTINCT FROM '2901181999999' OR
    upper(regexp_replace(btrim(coalesce(v_r.receiving_name,'')),'[[:space:]]+',' ','g'))
      <>'BUI XUAN TUNG'
 THEN RETURN jsonb_build_object('ok',false,'status','bill_not_eligible_for_manual_bank_collection'); END IF;
 IF EXISTS (SELECT 1 FROM public.chat_bank_app_collection_links l WHERE l.receipt_id=v_r.id)
 OR EXISTS (SELECT 1 FROM public.chat_bank_bill_manual_collections m WHERE m.receipt_id=v_r.id)
 OR EXISTS(SELECT 1 FROM public.taphoa_command_log c WHERE c.command_id=v_r.id)
 THEN RETURN jsonb_build_object('ok',false,'status','bill_already_used'); END IF;
 -- Never turn a duplicate screenshot / reused bank reference into a new ledger.
 IF EXISTS (SELECT 1 FROM public.chat_bank_bill_receipts other
   WHERE other.id<>v_r.id AND other.status='received' AND other.ledger_id IS NOT NULL
    AND ((other.image_sha256 IS NOT NULL AND other.image_sha256=v_r.image_sha256)
    OR (other.amount_vnd=v_r.amount_vnd AND v_r.transfer_reference IS NOT NULL
      AND btrim(v_r.transfer_reference)<>'' AND
      upper(btrim(other.transfer_reference))=upper(btrim(v_r.transfer_reference))
      AND other.transfer_at_vn::date=v_r.transfer_at_vn::date)))
 THEN RETURN jsonb_build_object('ok',false,'status','bill_reference_already_collected'); END IF;
 v_thousands:=v_r.amount_vnd::numeric/1000;
 -- Serialize debt write across ALL channels, even cash payments.
 PERFORM pg_advisory_xact_lock(hashtextextended('taphoa-money:'||p_customer_id::text,0));
 IF p_existing_ledger_id IS NOT NULL THEN
   SELECT * INTO v_ledger FROM public.taphoa_debt_ledger l WHERE l.id=p_existing_ledger_id FOR UPDATE;
   IF NOT FOUND OR v_ledger.customer_account_id<>p_customer_id OR
      v_ledger.entry_type<>'collection' OR v_ledger.amount_vnd<>-v_thousands OR
      v_ledger.note ILIKE 'Chuyển khoản tự động%' OR
      v_ledger.created_at NOT BETWEEN
        (v_r.transfer_at_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')-interval '12 hours'
        AND (v_r.transfer_at_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '7 days'
      OR EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links l WHERE l.ledger_id=v_ledger.id)
      OR EXISTS(SELECT 1 FROM public.chat_bank_manual_collections m WHERE m.ledger_id=v_ledger.id)
      OR EXISTS(SELECT 1 FROM public.chat_bank_bill_manual_collections c WHERE c.ledger_id=v_ledger.id)
   THEN RETURN jsonb_build_object('ok',false,'status','existing_ledger_invalid'); END IF;
   v_id:=v_ledger.id;v_mode:='linked_existing';
 ELSE
   IF EXISTS (SELECT 1 FROM public.taphoa_debt_ledger l
     WHERE l.customer_account_id=p_customer_id AND l.entry_type='collection'
     AND l.amount_vnd=-v_thousands AND l.note NOT ILIKE 'Chuyển khoản tự động%'
     AND l.created_at BETWEEN
       (v_r.transfer_at_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')-interval '12 hours'
       AND (v_r.transfer_at_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '7 days'
     AND NOT EXISTS(SELECT 1 FROM public.chat_bank_bill_manual_collections c WHERE c.ledger_id=l.id))
   THEN RETURN jsonb_build_object('ok',false,'status','possible_existing_manual_collection'); END IF;
   v_before:=public.taphoa_chat_customer_balance_value(p_customer_id);
   INSERT INTO public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
   VALUES(p_customer_id,'collection',-v_thousands,
     'Thu thủ công theo bill #'||v_r.id::text||' · ngân hàng Agribank xác minh trực tiếp: '||
     left(btrim(p_note),500),v_admin)
   RETURNING id INTO v_id;
   PERFORM public.taphoa_bump_revision('debt');
   v_after:=public.taphoa_chat_customer_balance_value(p_customer_id);
   v_mode:='collected';
 END IF;
 v_note:=left(btrim(p_note),1000);
 INSERT INTO public.chat_bank_bill_manual_collections
   (receipt_id,ledger_id,customer_account_id,confirmed_by,mode,note)
 VALUES (v_r.id,v_id,p_customer_id,v_admin,v_mode,v_note);
 UPDATE public.chat_bank_bill_receipts
  SET status='received',reason='manual_agribank_bill_confirmed',
      ledger_id=v_id,
      balance_before_thousands=CASE WHEN v_mode='collected' THEN v_before ELSE balance_before_thousands END,
      balance_after_thousands=CASE WHEN v_mode='collected' THEN v_after ELSE balance_after_thousands END
 WHERE id=v_r.id AND ledger_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'bank310_bill_lock_race'; END IF;
 -- Customer is notified exactly once when this RPC itself creates the ledger.
 -- Existing cash/manual ledger may already have its own confirmation.
 IF v_mode='collected' THEN
   v_url:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
   v_notice_text:=public.taphoa_chat_finance_notice(
     'collection',v_thousands,v_before,v_after,
     'Chuyển khoản Agribank','Đã thu thủ công sau khi Admin xác minh ngân hàng · Bill #'||
     left(v_r.id::text,8)||' · Sổ #'||v_id::text,v_url);
   v_message_id:=public.taphoa_chat_notify_customer(p_customer_id,v_admin,
     'taphoa:bank-bill-manual:'||v_r.id::text||':collection',v_notice_text);
 END IF;
 PERFORM v21_private.chat_bank_report_touch();
 RETURN jsonb_build_object('ok',true,'status',v_mode,'receipt_id',v_r.id,
   'ledger_id',v_id,'customer_id',p_customer_id,'debt_changed',v_mode='collected',
   'notice_sent',v_message_id IS NOT NULL,'locked_against_auto_collect',true);
END;
$bank310_collect$;
REVOKE ALL ON FUNCTION public.chat_bank_bill_manual_collect(uuid,uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_bill_manual_collect(uuid,uuid,uuid,text,bigint) TO authenticated;

-- BANK-310 server-side second guard: even a DIFFERENT bill cannot consume a
-- bank notification that corresponds to a previously manually collected bill.
-- This is deliberately fail-closed for same-minute/same-amount collisions.
DO $bank310_guard$
DECLARE
  auto_def text;
  manual_def text;
  auto_anchor text := 'image_at:=r.transfer_at_vn at time zone ''Asia/Ho_Chi_Minh'';';
  auto_guard text := $guard_auto$
  IF EXISTS (
    SELECT 1 FROM public.chat_bank_bill_manual_collections m
    JOIN public.chat_bank_bill_receipts prior ON prior.id=m.receipt_id
    WHERE prior.status='received' AND prior.ledger_id=m.ledger_id
      AND prior.amount_vnd=n.amount_vnd
      AND prior.receiving_account='2901181999999'
      AND prior.transfer_at_vn IS NOT NULL
      AND abs(extract(epoch from
        ((prior.transfer_at_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')-transaction_at)))<=60
  ) THEN RETURN jsonb_build_object('ok',false,'status','late_bank_notice_previously_manually_collected'); END IF;
$guard_auto$;
  manual_anchor text := 'SELECT * INTO v_existing FROM public.chat_bank_manual_collections WHERE notification_id=p_notice_id;';
  manual_guard text := $guard_manual$
 IF EXISTS (
   SELECT 1 FROM public.chat_bank_bill_manual_collections m
   JOIN public.chat_bank_bill_receipts prior ON prior.id=m.receipt_id
   WHERE prior.status='received' AND prior.ledger_id=m.ledger_id
    AND prior.amount_vnd=v_notice.amount_vnd
    AND prior.receiving_account='2901181999999'
    AND prior.transfer_at_vn IS NOT NULL
    AND abs(extract(epoch from
      ((prior.transfer_at_vn AT TIME ZONE 'Asia/Ho_Chi_Minh')-v_notice.transfer_at)))<=60
 ) THEN RETURN jsonb_build_object('ok',false,'status','late_bank_notice_previously_manually_collected'); END IF;
$guard_manual$;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure) INTO auto_def;
 IF position('late_bank_notice_previously_manually_collected' IN auto_def)=0 THEN
   IF position(auto_anchor IN auto_def)=0 THEN RAISE EXCEPTION 'bank310_auto_collect_anchor_changed'; END IF;
   EXECUTE replace(auto_def,auto_anchor,auto_guard||E'\n'||auto_anchor);
 END IF;
 SELECT pg_get_functiondef('public.chat_bank_manual_collect(uuid,bigint,uuid,text,bigint)'::regprocedure)
 INTO manual_def;
 IF position('late_bank_notice_previously_manually_collected' IN manual_def)=0 THEN
   IF position(manual_anchor IN manual_def)=0 THEN RAISE EXCEPTION 'bank310_manual_collect_anchor_changed'; END IF;
   EXECUTE replace(manual_def,manual_anchor,manual_guard||E'\n'||manual_anchor);
 END IF;
END;
$bank310_guard$;

-- Admin dashboard links manual receipts to the exact verified ledger; a manual
-- collection NEVER pretends an Android bank notification was received.
DO $bank310_dashboard$
DECLARE
 source text;
 edited text;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_dashboard(uuid,date)'::regprocedure) INTO source;
 IF position('bank310_bill_manual.ledger_id' IN source)>0 THEN RETURN; END IF;
 IF position('l.ledger_id::text ledger_id,' IN source)=0 OR
    position('LEFT JOIN public.chat_bank_app_collection_links l ON l.receipt_id=r.id' IN source)=0 OR
    position('WHEN r.status=''duplicate'' THEN ''duplicate''' IN source)=0 THEN
   RAISE EXCEPTION 'bank310_dashboard_contract_changed';
 END IF;
 edited:=replace(source,
   'l.ledger_id::text ledger_id,',
   'coalesce(l.ledger_id,bank310_bill_manual.ledger_id)::text ledger_id,');
 edited:=replace(edited,
   'WHEN r.status=''duplicate'' THEN ''duplicate''',
   'WHEN bank310_bill_manual.ledger_id IS NOT NULL AND r.status=''received'' '||
   'AND r.ledger_id=bank310_bill_manual.ledger_id THEN ''matched'''||E'\n '||
   'WHEN r.status=''duplicate'' THEN ''duplicate''');
 edited:=replace(edited,
   'LEFT JOIN public.chat_bank_app_collection_links l ON l.receipt_id=r.id',
   'LEFT JOIN public.chat_bank_app_collection_links l ON l.receipt_id=r.id'||E'\n '||
   'LEFT JOIN public.chat_bank_bill_manual_collections bank310_bill_manual ON bank310_bill_manual.receipt_id=r.id');
 EXECUTE edited;
END;
$bank310_dashboard$;
COMMIT;
