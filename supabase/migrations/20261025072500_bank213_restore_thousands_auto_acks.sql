-- BANK-213: Restore original Chat money units for verified Agribank receipts.
-- Notification input + bill OCR: actual VND; sổ/Chat: VND / 1,000.
-- Manual collection: user's entered thousands = ledger thousands.
-- This migration NEVER creates or changes a debt ledger entry.
-- Existing system-generated notices are edited only when every numeric line
-- matches the previously-generated faulty BANK-209 template and DB evidence.

CREATE OR REPLACE FUNCTION public.chat_bank_auto_collection_ack_drain(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
DECLARE x record; v_message uuid; v_text text; v_sent integer:=0; v_muted integer:=0;
 v_failed integer:=0; v_count integer:=0; v_url text; v_amount numeric;
BEGIN
 IF NOT pg_try_advisory_xact_lock(17812092) THEN
   RETURN jsonb_build_object('ok',true,'busy',true);
 END IF;
 FOR x IN
  SELECT r.id receipt_id, r.amount_vnd, r.customer_account_id,
   r.balance_before_thousands, r.balance_after_thousands,
   l.ledger_id,l.notification_id,d.created_by_account_id admin_id,
   a.status last_status,a.attempt_count
  FROM public.chat_bank_app_collection_links l
  JOIN public.chat_bank_bill_receipts r ON r.id=l.receipt_id
  JOIN public.taphoa_debt_ledger d ON d.id=l.ledger_id
  JOIN public.taphoa_agribank_notifications n ON n.id=l.notification_id
  LEFT JOIN public.chat_bank_auto_collection_ack a ON a.receipt_id=r.id
  WHERE l.created_at >= timestamptz '2026-10-24 00:00:00+07'
    AND l.created_at >= now()-interval '7 days'
    AND r.status='received' AND r.ledger_id=l.ledger_id
    AND r.reason='agribank_plus_credit_and_bill_matched'
    AND n.status='credit_candidate' AND n.package_name='com.vnpay.Agribank3g'
    AND n.is_own_transfer IS FALSE AND n.bank_credit_account='2901181999999'
    AND n.amount_vnd=r.amount_vnd AND d.customer_account_id=r.customer_account_id
    AND d.entry_type='collection' AND d.amount_vnd=-(r.amount_vnd::numeric/1000)
    AND r.balance_before_thousands IS NOT NULL
    AND r.balance_after_thousands IS NOT NULL
    AND (a.receipt_id IS NULL OR (a.status='retry' AND a.attempt_count<3
       AND a.updated_at<now()-interval '2 minutes'))
    AND NOT EXISTS (
       SELECT 1 FROM public.chat_bank_manual_collections manual
       WHERE manual.notification_id=l.notification_id
    )
  ORDER BY l.created_at,l.receipt_id LIMIT least(greatest(coalesce(p_limit,20),1),30)
 LOOP
  v_count:=v_count+1;
  BEGIN
   -- Stable sender/client_id provides true idempotency even across retries.
   SELECT m.id INTO v_message FROM public.v21_messages m
   WHERE m.sender_account_id=x.admin_id
    AND m.client_id='taphoa:'||x.receipt_id::text||':collection'
   LIMIT 1;
   IF v_message IS NULL THEN
     -- BANK-213: taphoa_debt_ledger stores thousands. Match established
     -- money convention for cash/manual bank/older auto receipts: no "đ".
     v_amount:=x.amount_vnd::numeric/1000;
     v_text:='✅ Đã thu · '||public.taphoa_chat_money(v_amount)
       ||E'\nĐã đối soát Agribank · Sổ #'||x.ledger_id::text
       ||E'\n'||public.taphoa_chat_balance_label(x.balance_before_thousands::numeric,true)
       ||E'\n'||public.taphoa_chat_balance_label(x.balance_after_thousands::numeric,false);
     v_url:=public.taphoa_customer_mini_link(x.customer_account_id,'no',null,null,null);
     IF coalesce(v_url,'')<>'' THEN v_text:=v_text||E'\nXem công nợ: '||v_url; END IF;
     v_message:=public.taphoa_chat_notify_customer(
       x.customer_account_id,x.admin_id,'taphoa:'||x.receipt_id::text||':collection',v_text
     );
   END IF;
   INSERT INTO public.chat_bank_auto_collection_ack
     (receipt_id,ledger_id,notification_id,message_id,status,attempt_count,last_error)
   VALUES(x.receipt_id,x.ledger_id,x.notification_id,v_message,
     CASE WHEN v_message IS NULL THEN 'muted' ELSE 'sent' END,1,NULL)
   ON CONFLICT(receipt_id) DO UPDATE SET
     message_id=excluded.message_id,status=excluded.status,
     attempt_count=public.chat_bank_auto_collection_ack.attempt_count+1,
     last_error=NULL,updated_at=clock_timestamp()
   WHERE public.chat_bank_auto_collection_ack.status='retry';
   IF v_message IS NULL THEN v_muted:=v_muted+1;
   ELSE v_sent:=v_sent+1; END IF;
  EXCEPTION WHEN others THEN
   v_failed:=v_failed+1;
   INSERT INTO public.chat_bank_auto_collection_ack
     (receipt_id,ledger_id,notification_id,status,attempt_count,last_error)
   VALUES(x.receipt_id,x.ledger_id,x.notification_id,'retry',1,left(SQLERRM,240))
   ON CONFLICT(receipt_id) DO UPDATE SET
    status='retry',attempt_count=public.chat_bank_auto_collection_ack.attempt_count+1,
    last_error=left(SQLERRM,240),updated_at=clock_timestamp()
   WHERE public.chat_bank_auto_collection_ack.status='retry';
  END;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'checked',v_count,'sent',v_sent,
   'muted',v_muted,'retry',v_failed);
END;$function$
;

DO $bank213$
DECLARE
 x record;
 old_prefix text;
 new_prefix text;
 suffix text;
 changed_rows integer:=0;
 row_changes integer;
BEGIN
 FOR x IN
   SELECT a.message_id, a.ledger_id, a.receipt_id, r.amount_vnd,
      r.balance_before_thousands, r.balance_after_thousands,
      m.body
   FROM public.chat_bank_auto_collection_ack a
   JOIN public.chat_bank_app_collection_links l
     ON l.receipt_id=a.receipt_id AND l.ledger_id=a.ledger_id
     AND l.notification_id=a.notification_id
   JOIN public.chat_bank_bill_receipts r ON r.id=a.receipt_id
   JOIN public.taphoa_debt_ledger d ON d.id=a.ledger_id
   JOIN public.v21_messages m ON m.id=a.message_id
   WHERE a.status='sent' AND m.deleted_at IS NULL
     AND m.sender_account_id=d.created_by_account_id
     AND m.client_id='taphoa:'||a.receipt_id::text||':collection'
     AND d.customer_account_id=r.customer_account_id
     AND d.entry_type='collection'
     AND d.amount_vnd=-(r.amount_vnd::numeric/1000)
     AND r.balance_before_thousands IS NOT NULL
     AND r.balance_after_thousands IS NOT NULL
 LOOP
   old_prefix:='✅ Đã thu · '||
     replace(to_char(x.amount_vnd::numeric,'FM999,999,999,999,990'),',','.')||'đ'
     ||E'\nĐã đối soát Agribank · Sổ #'||x.ledger_id::text
     ||E'\nNợ trước: '||
     replace(to_char(x.balance_before_thousands*1000,'FM999,999,999,999,990'),',','.')||'đ'
     ||E'\nCòn nợ: '||
     replace(to_char(x.balance_after_thousands*1000,'FM999,999,999,999,990'),',','.')||'đ';
   IF left(x.body,char_length(old_prefix))<>old_prefix THEN CONTINUE; END IF;
   suffix:=substring(x.body FROM char_length(old_prefix)+1);
   IF suffix<>'' AND suffix NOT LIKE E'\nXem công nợ: https://%' THEN CONTINUE; END IF;
   IF suffix LIKE '%'||E'\n'||'%'||E'\n'||'%' THEN CONTINUE; END IF;

   new_prefix:='✅ Đã thu · '||
     public.taphoa_chat_money(x.amount_vnd::numeric/1000)
     ||E'\nĐã đối soát Agribank · Sổ #'||x.ledger_id::text
     ||E'\n'||public.taphoa_chat_balance_label(x.balance_before_thousands::numeric,true)
     ||E'\n'||public.taphoa_chat_balance_label(x.balance_after_thousands::numeric,false);
   UPDATE public.v21_messages m
   SET body=new_prefix||suffix
   WHERE m.id=x.message_id AND m.body=x.body;
   GET DIAGNOSTICS row_changes=ROW_COUNT;
   changed_rows:=changed_rows+row_changes;
 END LOOP;
 RAISE NOTICE 'BANK-213: corrected % verified system messages; no ledger changes',changed_rows;
END;
$bank213$;
