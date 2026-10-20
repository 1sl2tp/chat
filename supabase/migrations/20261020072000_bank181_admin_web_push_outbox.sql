-- BANK-181 · Admin-only PWA push for bank reconciliation.
-- Does not write Chat messages, receipts, links, or financial ledgers.
-- Deployed for new events only; historical 19/10 tests are never replayed.
CREATE TABLE IF NOT EXISTS public.chat_bank_admin_push_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_key text NOT NULL,
 recipient_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 kind text NOT NULL CHECK(kind IN ('bank_only','bill_waiting','matched','review')),
 notification_id bigint,
 receipt_id uuid,
 business_date date NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','retry','sent','dead')),
 available_at timestamptz NOT NULL DEFAULT now(),
 attempt_count integer NOT NULL DEFAULT 0,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_key,recipient_account_id)
);
CREATE INDEX IF NOT EXISTS chat_bank_admin_push_pending_idx
 ON public.chat_bank_admin_push_outbox(state,available_at,created_at)
 WHERE state IN ('pending','retry');
ALTER TABLE public.chat_bank_admin_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_bank_admin_push_outbox FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.chat_bank_admin_push_enqueue(
 p_kind text,p_key text,p_notification_id bigint,p_receipt_id uuid,p_day date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $fn$
BEGIN
 IF p_kind NOT IN ('bank_only','bill_waiting','matched','review')
    OR p_day IS NULL OR p_day<> (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR p_day < date '2026-10-20'
    OR p_key IS NULL OR length(p_key)>128
 THEN RETURN; END IF;
 INSERT INTO public.chat_bank_admin_push_outbox(
   event_key,recipient_account_id,kind,notification_id,receipt_id,business_date
 )
 SELECT p_key,a.id,p_kind,p_notification_id,p_receipt_id,p_day
 FROM public.v21_accounts a
 WHERE a.role='admin' AND a.auth_user_id IS NOT NULL
   AND a.deleted_at IS NULL AND a.locked_at IS NULL
 ON CONFLICT(event_key,recipient_account_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'bank_push_enqueue_skipped: %',SQLSTATE;
END;
$fn$;
REVOKE ALL ON FUNCTION v21_private.chat_bank_admin_push_enqueue(text,text,bigint,uuid,date)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.chat_bank_admin_push_on_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $fn$
BEGIN
 IF new.status='credit_candidate' AND new.is_own_transfer IS FALSE
    AND new.bank_credit_account='2901181999999' AND new.amount_vnd>0
    AND new.transfer_at IS NOT NULL
    AND new.package_name='com.vnpay.Agribank3g'
    AND new.body NOT ILIKE '%BUI XUAN TUNG%'
 THEN
  PERFORM v21_private.chat_bank_admin_push_enqueue(
   'bank_only','bank:'||new.id::text,new.id,NULL,
   (new.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
 END IF;
 RETURN new;
END;
$fn$;

CREATE OR REPLACE FUNCTION v21_private.chat_bank_admin_push_on_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $fn$
DECLARE v_kind text; v_day date; v_username text;
BEGIN
 IF TG_OP='UPDATE' AND old.status IS NOT DISTINCT FROM new.status THEN RETURN new; END IF;
 IF new.status NOT IN ('amount_read','review','duplicate') THEN RETURN new; END IF;
 SELECT username INTO v_username FROM public.v21_accounts WHERE id=new.customer_account_id;
 IF lower(coalesce(v_username,''))='test' THEN RETURN new; END IF;
 IF EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links l WHERE l.receipt_id=new.id)
 THEN RETURN new; END IF;
 v_day:=(new.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
 v_kind:=CASE
  WHEN new.status='amount_read' AND new.amount_vnd>0
    AND new.transfer_at_vn IS NOT NULL AND new.transfer_at_vn::date=v_day
    THEN 'bill_waiting'
  ELSE 'review' END;
 PERFORM v21_private.chat_bank_admin_push_enqueue(
  v_kind,v_kind||':'||new.id::text,NULL,new.id,v_day);
 RETURN new;
END;
$fn$;

CREATE OR REPLACE FUNCTION v21_private.chat_bank_admin_push_on_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $fn$
DECLARE n public.taphoa_agribank_notifications%rowtype;
 r public.chat_bank_bill_receipts%rowtype;
 v_username text;
BEGIN
 IF new.ledger_id IS NULL THEN RETURN new; END IF;
 SELECT * INTO n FROM public.taphoa_agribank_notifications WHERE id=new.notification_id;
 SELECT * INTO r FROM public.chat_bank_bill_receipts WHERE id=new.receipt_id;
 SELECT username INTO v_username FROM public.v21_accounts WHERE id=r.customer_account_id;
 IF n.id IS NULL OR r.id IS NULL
    OR n.is_own_transfer IS DISTINCT FROM FALSE
    OR n.bank_credit_account<>'2901181999999'
    OR n.status<>'credit_candidate'
    OR n.package_name<>'com.vnpay.Agribank3g'
    OR coalesce(n.body,'') ILIKE '%BUI XUAN TUNG%'
    OR lower(coalesce(v_username,''))='test'
    OR n.amount_vnd IS DISTINCT FROM r.amount_vnd
    OR r.transfer_at_vn IS NULL
    OR r.transfer_at_vn::date IS DISTINCT FROM (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
 THEN RETURN new; END IF;
 PERFORM v21_private.chat_bank_admin_push_enqueue(
 'matched','matched:'||new.notification_id::text,new.notification_id,new.receipt_id,
 (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
 RETURN new;
END;
$fn$;
REVOKE ALL ON FUNCTION v21_private.chat_bank_admin_push_on_notice() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION v21_private.chat_bank_admin_push_on_receipt() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION v21_private.chat_bank_admin_push_on_match() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS chat_bank_admin_push_notice_trg ON public.taphoa_agribank_notifications;
CREATE TRIGGER chat_bank_admin_push_notice_trg
 AFTER INSERT ON public.taphoa_agribank_notifications FOR EACH ROW
 EXECUTE FUNCTION v21_private.chat_bank_admin_push_on_notice();
DROP TRIGGER IF EXISTS chat_bank_admin_push_receipt_trg ON public.chat_bank_bill_receipts;
CREATE TRIGGER chat_bank_admin_push_receipt_trg
 AFTER INSERT OR UPDATE OF status ON public.chat_bank_bill_receipts FOR EACH ROW
 EXECUTE FUNCTION v21_private.chat_bank_admin_push_on_receipt();
DROP TRIGGER IF EXISTS chat_bank_admin_push_match_trg ON public.chat_bank_app_collection_links;
CREATE TRIGGER chat_bank_admin_push_match_trg
 AFTER INSERT ON public.chat_bank_app_collection_links FOR EACH ROW
 EXECUTE FUNCTION v21_private.chat_bank_admin_push_on_match();

-- Wake the EXISTING Web Push Edge Function. No new polling or cron owner.
DROP TRIGGER IF EXISTS chat_bank_admin_push_signal_trg ON public.chat_bank_admin_push_outbox;
CREATE TRIGGER chat_bank_admin_push_signal_trg
 AFTER INSERT ON public.chat_bank_admin_push_outbox
 FOR EACH ROW WHEN(new.state='pending')
 EXECUTE FUNCTION v21_private.admin_push_signal();

CREATE OR REPLACE FUNCTION public.chat_bank_admin_push_claim(p_limit integer DEFAULT 15)
RETURNS SETOF public.chat_bank_admin_push_outbox
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
BEGIN
 RETURN QUERY
 WITH picked AS (
  SELECT id FROM public.chat_bank_admin_push_outbox
  WHERE state IN ('pending','retry') AND available_at<=now()
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED
  LIMIT least(greatest(coalesce(p_limit,15),1),30)
 )
 UPDATE public.chat_bank_admin_push_outbox q
 SET state='processing', attempt_count=q.attempt_count+1,updated_at=now(),
     available_at=now()+interval '3 minutes'
 FROM picked WHERE q.id=picked.id
 RETURNING q.*;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_bank_admin_push_claim(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_admin_push_claim(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.chat_bank_admin_push_result(
 p_outbox_id uuid,p_ok boolean,p_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
BEGIN
 UPDATE public.chat_bank_admin_push_outbox
 SET state=CASE WHEN p_ok THEN 'sent'
                WHEN attempt_count>=4 THEN 'dead' ELSE 'retry' END,
     last_error=left(p_error,400),updated_at=now(),
     available_at=CASE WHEN p_ok THEN now()
              ELSE now()+make_interval(secs=>least(300,15*(2^greatest(0,attempt_count-1))::integer)) END
 WHERE id=p_outbox_id AND state='processing';
END;
$fn$;
REVOKE ALL ON FUNCTION public.chat_bank_admin_push_result(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_admin_push_result(uuid,boolean,text) TO service_role;
