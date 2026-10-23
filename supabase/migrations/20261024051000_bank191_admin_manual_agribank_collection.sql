-- BANK-191: Admin-triggered Agribank income collection and existing-manual-ledger linkage.
-- Monetary units: Agribank amount_vnd is VND; taphoa_debt_ledger amount_vnd is thousands of VND.
-- Historical bank report snapshots are never rewritten.
CREATE TABLE IF NOT EXISTS public.chat_bank_manual_collections (
  notification_id bigint PRIMARY KEY REFERENCES public.taphoa_agribank_notifications(id),
  customer_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
  ledger_id bigint NOT NULL UNIQUE REFERENCES public.taphoa_debt_ledger(id),
  mode text NOT NULL CHECK (mode IN ('collected','linked_existing')),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 5 AND 1000),
  confirmed_by uuid NOT NULL REFERENCES public.v21_accounts(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.chat_bank_manual_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_bank_manual_collections FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS chat_bank_manual_collections_customer_idx
 ON public.chat_bank_manual_collections(customer_account_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.chat_bank_manual_collection_statuses(
 p_app_session_id uuid,p_day date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE v_admin uuid; v_rows jsonb;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a
  WHERE a.id=v_admin AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_day<date '2026-10-19' OR p_day>(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
 THEN RAISE EXCEPTION 'date_out_of_range'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'notice_id',c.notification_id::text,'customer_id',c.customer_account_id::text,
  'customer_name',a.display_name,'ledger_id',c.ledger_id,'mode',c.mode,
  'note',c.note,'created_at',c.created_at) ORDER BY c.created_at DESC),'[]'::jsonb)
 INTO v_rows FROM public.chat_bank_manual_collections c
 JOIN public.taphoa_agribank_notifications n ON n.id=c.notification_id
 JOIN public.v21_accounts a ON a.id=c.customer_account_id
 WHERE (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day;
 RETURN v_rows;
END;$$;
REVOKE ALL ON FUNCTION public.chat_bank_manual_collection_statuses(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_bank_manual_collection_statuses(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_bank_manual_collection_prepare(
 p_app_session_id uuid,p_notice_id bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE v_admin uuid; v_notice public.taphoa_agribank_notifications%rowtype;
 v_customers jsonb; v_candidates jsonb; v_existing jsonb;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a
  WHERE a.id=v_admin AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_notice FROM public.taphoa_agribank_notifications WHERE id=p_notice_id;
 IF NOT FOUND OR v_notice.status<>'credit_candidate' OR v_notice.is_own_transfer IS DISTINCT FROM false
  OR v_notice.bank_credit_account IS DISTINCT FROM '2901181999999'
 THEN RETURN jsonb_build_object('ok',false,'status','invalid_bank_notice'); END IF;
 SELECT to_jsonb(c) INTO v_existing FROM (
  SELECT m.mode,m.note,m.ledger_id,m.customer_account_id::text customer_id,a.display_name customer_name,
   m.created_at FROM public.chat_bank_manual_collections m
  JOIN public.v21_accounts a ON a.id=m.customer_account_id
  WHERE m.notification_id=p_notice_id
 ) c;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'name',a.display_name)
 ORDER BY lower(a.display_name),a.id),'[]'::jsonb) INTO v_customers
 FROM public.v21_accounts a WHERE a.role='user' AND a.contact_group='customer'
 AND a.deleted_at IS NULL AND a.locked_at IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'ledger_id',l.id,'customer_id',l.customer_account_id::text,
  'customer_name',a.display_name,'note',l.note,'created_at',l.created_at)
 ORDER BY l.created_at DESC),'[]'::jsonb) INTO v_candidates
 FROM public.taphoa_debt_ledger l JOIN public.v21_accounts a ON a.id=l.customer_account_id
 WHERE l.entry_type='collection' AND l.amount_vnd=-v_notice.amount_vnd::numeric/1000
 AND l.created_at BETWEEN v_notice.transfer_at-interval '12 hours'
                      AND v_notice.transfer_at+interval '7 days'
 AND l.note NOT ILIKE 'Chuyển khoản tự động%'
 AND NOT EXISTS (SELECT 1 FROM public.chat_bank_app_collection_links x WHERE x.ledger_id=l.id)
 AND NOT EXISTS (SELECT 1 FROM public.chat_bank_manual_collections x WHERE x.ledger_id=l.id);
 RETURN jsonb_build_object('ok',true,'notice_id',p_notice_id::text,
  'customers',v_customers,'possible_existing',v_candidates,'already_recorded',v_existing,
  'amount_vnd',v_notice.amount_vnd,'transfer_at',v_notice.transfer_at,'body',left(v_notice.body,500));
END;$$;
REVOKE ALL ON FUNCTION public.chat_bank_manual_collection_prepare(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_bank_manual_collection_prepare(uuid,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_bank_manual_collect(
 p_app_session_id uuid,p_notice_id bigint,p_customer_id uuid,p_note text,
 p_existing_ledger_id bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE v_admin uuid; v_notice public.taphoa_agribank_notifications%rowtype;
 v_ledger public.taphoa_debt_ledger%rowtype; v_id bigint;
 v_mode text; v_thousands numeric; v_before numeric; v_after numeric;
 v_message uuid; v_text text; v_link text; v_existing public.chat_bank_manual_collections%rowtype;
 v_credit text[];
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a
  WHERE a.id=v_admin AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.v21_accounts a
  WHERE a.id=p_customer_id AND a.role='user' AND a.contact_group='customer'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'status','customer_invalid'); END IF;
 IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 5 AND 1000
 THEN RETURN jsonb_build_object('ok',false,'status','note_required'); END IF;
 -- The automatic collector uses the same advisory lock before locking the notice.
 PERFORM pg_advisory_xact_lock(17812026);
 SELECT * INTO v_notice FROM public.taphoa_agribank_notifications
  WHERE id=p_notice_id FOR UPDATE;
 IF NOT FOUND OR v_notice.status<>'credit_candidate' OR v_notice.is_own_transfer IS DISTINCT FROM false
   OR v_notice.bank_credit_account IS DISTINCT FROM '2901181999999'
   OR v_notice.package_name IS DISTINCT FROM 'com.vnpay.Agribank3g'
   OR v_notice.transfer_at IS NULL
   OR v_notice.amount_vnd IS NULL OR v_notice.amount_vnd<=0
   OR v_notice.amount_vnd>=1000000000000 OR mod(v_notice.amount_vnd,1000)<>0
 THEN RETURN jsonb_build_object('ok',false,'status','invalid_bank_notice'); END IF;
 -- Refuse an event whose raw alert does not actually contain the credited amount.
 v_credit:=regexp_match(v_notice.body,
   '([0-9]{9,20})[[:space:]]*:[[:space:]]*\+[[:space:]]*([0-9][0-9.,]*)[[:space:]]*(VND|VNĐ|Đ)','i');
 IF v_credit IS NULL OR v_credit[1]<>'2901181999999'
   OR v_credit[2] !~ '(^[0-9]{1,12}$|^[0-9]{1,3}([.,][0-9]{3})+$)'
   OR replace(replace(v_credit[2],'.',''),',','')::bigint<>v_notice.amount_vnd
 THEN RETURN jsonb_build_object('ok',false,'status','unverified_bank_credit'); END IF;
 SELECT * INTO v_existing FROM public.chat_bank_manual_collections WHERE notification_id=p_notice_id;
 IF FOUND THEN RETURN jsonb_build_object('ok',false,'status','already_collected',
   'ledger_id',v_existing.ledger_id,'mode',v_existing.mode); END IF;
 IF EXISTS (SELECT 1 FROM public.chat_bank_app_collection_links x WHERE x.notification_id=p_notice_id)
 THEN RETURN jsonb_build_object('ok',false,'status','already_auto_collected'); END IF;
 v_thousands:=v_notice.amount_vnd::numeric/1000;
 IF p_existing_ledger_id IS NOT NULL THEN
   SELECT * INTO v_ledger FROM public.taphoa_debt_ledger WHERE id=p_existing_ledger_id FOR UPDATE;
   IF NOT FOUND OR v_ledger.customer_account_id<>p_customer_id OR v_ledger.entry_type<>'collection'
      OR v_ledger.amount_vnd<>-v_thousands
      OR v_ledger.created_at NOT BETWEEN v_notice.transfer_at-interval '12 hours'
                                  AND v_notice.transfer_at+interval '7 days'
      OR v_ledger.note ILIKE 'Chuyển khoản tự động%'
      OR EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links x WHERE x.ledger_id=v_ledger.id)
      OR EXISTS(SELECT 1 FROM public.chat_bank_manual_collections x WHERE x.ledger_id=v_ledger.id)
   THEN RETURN jsonb_build_object('ok',false,'status','existing_collection_invalid'); END IF;
   v_id:=v_ledger.id; v_mode:='linked_existing';
 ELSE
   IF EXISTS(SELECT 1 FROM public.taphoa_debt_ledger l
     WHERE l.customer_account_id=p_customer_id AND l.entry_type='collection'
      AND l.amount_vnd=-v_thousands
      AND l.created_at BETWEEN v_notice.transfer_at-interval '12 hours'
                           AND v_notice.transfer_at+interval '7 days'
      AND l.note NOT ILIKE 'Chuyển khoản tự động%'
      AND NOT EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links x WHERE x.ledger_id=l.id)
      AND NOT EXISTS(SELECT 1 FROM public.chat_bank_manual_collections x WHERE x.ledger_id=l.id))
   THEN RETURN jsonb_build_object('ok',false,'status','possible_manual_collection'); END IF;
   v_before:=public.taphoa_chat_customer_balance_value(p_customer_id);
   INSERT INTO public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
   VALUES (p_customer_id,'collection',-v_thousands,
      'Thu Agribank #'||p_notice_id::text||' ('||
      to_char(v_notice.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI')||
      '): '||btrim(p_note),v_admin) RETURNING id INTO v_id;
   PERFORM public.taphoa_bump_revision('debt');
   v_after:=public.taphoa_chat_customer_balance_value(p_customer_id);
   v_text:='✅ Đã thu · '||public.taphoa_chat_money(v_thousands)
     ||E'\n'||public.taphoa_chat_balance_label(v_before,true)
     ||E'\n'||public.taphoa_chat_balance_label(v_after,false)
     ||E'\nGhi chú: Thu từ Agribank · '||btrim(p_note);
   v_link:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
   IF coalesce(v_link,'')<>'' THEN v_text:=v_text||E'\nXem công nợ: '||v_link; END IF;
   v_message:=public.taphoa_chat_notify_customer(p_customer_id,v_admin,
      'taphoa:bank-manual:'||p_notice_id::text||':collection',v_text);
   v_mode:='collected';
 END IF;
 INSERT INTO public.chat_bank_manual_collections
  (notification_id,customer_account_id,ledger_id,mode,note,confirmed_by)
 VALUES (p_notice_id,p_customer_id,v_id,v_mode,btrim(p_note),v_admin);
 PERFORM v21_private.chat_bank_report_touch();
 RETURN jsonb_build_object('ok',true,'status',v_mode,'notification_id',p_notice_id::text,
   'ledger_id',v_id,'customer_id',p_customer_id::text,'debt_changed',v_mode='collected',
   'notice_sent',v_message IS NOT NULL,'amount_vnd',v_notice.amount_vnd);
END;$$;
REVOKE ALL ON FUNCTION public.chat_bank_manual_collect(uuid,bigint,uuid,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_bank_manual_collect(uuid,bigint,uuid,text,bigint) TO authenticated;
