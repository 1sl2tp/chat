-- BANK-209: A confirmed Agribank collection must be visible as "Đã thu".
-- Restore exactly one Chat confirmation per VERIFIED ledger + receipt + bank credit.
-- This drain executes AFTER the money transaction has committed, so a push/Chat
-- outage cannot roll back a legitimate collection or trigger a second debit.
CREATE TABLE IF NOT EXISTS public.chat_bank_auto_collection_ack (
 receipt_id uuid PRIMARY KEY REFERENCES public.chat_bank_bill_receipts(id) ON DELETE RESTRICT,
 ledger_id bigint NOT NULL REFERENCES public.taphoa_debt_ledger(id),
 notification_id bigint NOT NULL REFERENCES public.taphoa_agribank_notifications(id),
 message_id uuid REFERENCES public.v21_messages(id),
 status text NOT NULL CHECK (status IN ('sent','muted','retry')),
 attempt_count integer NOT NULL DEFAULT 0,
 last_error text,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.chat_bank_auto_collection_ack ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_bank_auto_collection_ack FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.chat_bank_auto_collection_ack_drain(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,v21_private,pg_temp AS $$
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
     v_amount:=x.amount_vnd;
     v_text:='✅ Đã thu · '||
       replace(to_char(v_amount,'FM999,999,999,999,990'),',','.')||'đ'
       ||E'\nĐã đối soát Agribank · Sổ #'||x.ledger_id::text
       ||E'\nNợ trước: '||
       replace(to_char(x.balance_before_thousands*1000,'FM999,999,999,999,990'),',','.')||'đ'
       ||E'\nCòn nợ: '||
       replace(to_char(x.balance_after_thousands*1000,'FM999,999,999,999,990'),',','.')||'đ';
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
END;$$;
REVOKE ALL ON FUNCTION public.chat_bank_auto_collection_ack_drain(integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_auto_collection_ack_drain(integer) TO service_role;
-- pg_cron runs as the database owner; its scheduled query can only emit Chat
-- confirmations, NEVER book another debt movement.
SELECT cron.schedule('taphoa-bank-auto-collection-ack-v1','*/2 * * * *',
 'SELECT public.chat_bank_auto_collection_ack_drain(20);');
