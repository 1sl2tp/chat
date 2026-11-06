CREATE OR REPLACE FUNCTION public.chat_bank_manual_collect(p_app_session_id uuid, p_notice_id bigint, p_customer_id uuid, p_note text, p_existing_ledger_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
DECLARE v_admin uuid; v_notice public.taphoa_agribank_notifications%rowtype;
 v_ledger public.taphoa_debt_ledger%rowtype; v_id bigint;
 v_mode text; v_thousands numeric; v_before numeric; v_after numeric;
 v_message uuid; v_text text; v_link text; v_existing public.chat_bank_manual_collections%rowtype;
 v_credit text[];
 v_recorded_vnd bigint; v_ignored_vnd bigint; v_audit_suffix text;
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
   OR v_notice.amount_vnd IS NULL OR v_notice.amount_vnd<1000
   OR v_notice.amount_vnd>=1000000000000
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
 -- SPEC-BANK-MANUAL-ROUND-DOWN-20261104: verified bank proof stays exact;
 -- only the manual customer debt entry drops sub-1,000 VND remainder.
 v_ignored_vnd:=mod(v_notice.amount_vnd,1000);
 v_recorded_vnd:=v_notice.amount_vnd-v_ignored_vnd;
 v_thousands:=v_recorded_vnd::numeric/1000;
 v_audit_suffix:=CASE WHEN v_ignored_vnd>0
   THEN ' [NH thực nhận '||v_notice.amount_vnd::text
     ||'đ; công nợ ghi thu '||v_recorded_vnd::text
     ||'đ; bỏ '||v_ignored_vnd::text||'đ lẻ]'
   ELSE '' END;
 -- SPEC-FINANCE-CUSTOMER-LOCK-ALL-CHANNELS-20261101:
 -- Lock before checking for manual duplicates and reading ledger balances.
 PERFORM pg_advisory_xact_lock(hashtextextended('taphoa-money:' || p_customer_id::text,0));
 IF p_existing_ledger_id IS NOT NULL THEN
   SELECT * INTO v_ledger FROM public.taphoa_debt_ledger WHERE id=p_existing_ledger_id FOR UPDATE;
   IF NOT FOUND OR v_ledger.customer_account_id<>p_customer_id OR v_ledger.entry_type<>'collection'
      OR v_ledger.amount_vnd NOT IN (-v_thousands,-v_notice.amount_vnd::numeric/1000)
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
      AND l.amount_vnd IN (-v_thousands,-v_notice.amount_vnd::numeric/1000)
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
      '): '||btrim(p_note)||v_audit_suffix,v_admin) RETURNING id INTO v_id;
   PERFORM public.taphoa_bump_revision('debt');
   v_after:=public.taphoa_chat_customer_balance_value(p_customer_id);
   v_link:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
   v_text:=public.taphoa_chat_finance_notice(
     'collection',v_thousands,v_before,v_after,
     'Chuyển khoản Agribank','Thu từ Agribank · '||btrim(p_note),v_link);
   v_message:=public.taphoa_chat_notify_customer(p_customer_id,v_admin,
      'taphoa:bank-manual:'||p_notice_id::text||':collection',v_text);
   v_mode:='collected';
 END IF;
 INSERT INTO public.chat_bank_manual_collections
  (notification_id,customer_account_id,ledger_id,mode,note,confirmed_by)
 VALUES (p_notice_id,p_customer_id,v_id,v_mode,btrim(p_note)||v_audit_suffix,v_admin);
 PERFORM v21_private.chat_bank_report_touch();
 RETURN jsonb_build_object('ok',true,'status',v_mode,'notification_id',p_notice_id::text,
   'ledger_id',v_id,'customer_id',p_customer_id::text,'debt_changed',v_mode='collected',
   'notice_sent',v_message IS NOT NULL,'amount_vnd',v_notice.amount_vnd,
   'recorded_amount_vnd',v_recorded_vnd,
   'ignored_remainder_vnd',v_ignored_vnd);
END;$function$
;
