-- BANK-212: strict 60-second bank-printed time matching and bounded verified retries.
-- This does not bypass the authenticated account, duplicate, manual collection
-- or exact bank-credit checks in chat_bank_app_collect.
CREATE TABLE IF NOT EXISTS public.chat_bank_auto_collect_attempts (
 receipt_id uuid PRIMARY KEY REFERENCES public.chat_bank_bill_receipts(id) ON DELETE RESTRICT,
 notification_id bigint NOT NULL REFERENCES public.taphoa_agribank_notifications(id),
 attempt_count integer NOT NULL DEFAULT 0,
 outcome text NOT NULL CHECK (outcome IN ('received','retry','blocked')),
 reason text NOT NULL DEFAULT '',
 ledger_id bigint REFERENCES public.taphoa_debt_ledger(id),
 last_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.chat_bank_auto_collect_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_bank_auto_collect_attempts FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE fn text; needle text:='abs(extract(epoch from(image_at-transaction_at)))>300';
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure) INTO fn;
 IF position('BANK-212: one-minute transaction time tolerance' IN fn)>0 THEN RETURN; END IF;
 IF position(needle IN fn)=0 OR position('already_manual_collected' IN fn)=0
  OR position('pg_advisory_xact_lock(17812026)' IN fn)=0
  OR position('insert into public.chat_bank_app_collection_links' IN fn)=0
  OR position('r.transfer_at_vn is null' IN fn)=0
 THEN RAISE EXCEPTION 'bank212_financial_guard_mismatch'; END IF;
 fn:=replace(fn,needle,'abs(extract(epoch from(image_at-transaction_at)))>60');
 fn:=replace(fn,'  -- Validate actual bank timestamp printed inside the Agribank notification.',
   '  -- BANK-212: one-minute transaction time tolerance.'||E'\n'||
   '  -- Validate actual bank timestamp printed inside the Agribank notification.');
 EXECUTE fn;
END;
$patch$;

CREATE OR REPLACE FUNCTION public.chat_bank_auto_collect_retry(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
DECLARE
 x record;
 v_answer jsonb;
 v_status text;
 v_outcome text;
 v_reason text;
 v_ledger bigint;
 v_checked integer:=0;
 v_received integer:=0;
 v_blocked integer:=0;
 v_failed integer:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.chat_auto_collect_settings
   WHERE singleton=true AND enabled=true AND ready=true) THEN
   RETURN jsonb_build_object('ok',true,'disabled',true);
 END IF;
 IF NOT pg_try_advisory_xact_lock(17812094) THEN
   RETURN jsonb_build_object('ok',true,'busy',true);
 END IF;
 FOR x IN
   SELECT r.id AS receipt_id,r.media_asset_id,r.raw_read,
     (r.raw_read#>>'{match_preview,notification_id}')::bigint AS notification_id
   FROM public.chat_bank_bill_receipts r
   LEFT JOIN public.chat_bank_auto_collect_attempts a ON a.receipt_id=r.id
   WHERE r.status='amount_read' AND r.ledger_id IS NULL
     AND r.raw_read#>>'{match_preview,status}'='candidate_unique'
     AND r.raw_read#>>'{match_preview,source}'='agribank_plus_notification'
     AND r.raw_read#>>'{match_preview,notification_id}' ~ '^[0-9]{1,12}$'
     AND r.transfer_at_vn::date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     AND (r.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=
         (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     AND (a.receipt_id IS NULL OR (a.outcome='retry'
        AND a.attempt_count<3 AND a.last_attempt_at<=now()-interval '2 minutes'))
   ORDER BY r.sent_at,r.id
   LIMIT least(greatest(coalesce(p_limit,20),1),30)
 LOOP
   v_checked:=v_checked+1;v_answer:=null;v_ledger:=null;
   BEGIN
     v_answer:=public.chat_bank_app_collect(x.media_asset_id,x.notification_id);
     v_status:=coalesce(v_answer->>'status','unknown');
     IF (v_answer->>'ok')::boolean IS TRUE AND v_status='received' THEN
       v_outcome:='received';
       v_reason:='verified_financial_posting';
       v_ledger:=nullif(v_answer->>'ledger_id','')::bigint;
       v_received:=v_received+1;
     ELSE
       v_outcome:='blocked';v_reason:=left(v_status,180);
       v_blocked:=v_blocked+1;
     END IF;
   EXCEPTION WHEN others THEN
     v_outcome:='retry';
     v_reason:='collector_error_'||SQLSTATE||':'||left(SQLERRM,140);
     v_failed:=v_failed+1;
   END;
   INSERT INTO public.chat_bank_auto_collect_attempts
     (receipt_id,notification_id,attempt_count,outcome,reason,ledger_id,last_attempt_at)
   VALUES (x.receipt_id,x.notification_id,1,v_outcome,v_reason,v_ledger,clock_timestamp())
   ON CONFLICT(receipt_id) DO UPDATE SET
     notification_id=excluded.notification_id,
     attempt_count=public.chat_bank_auto_collect_attempts.attempt_count+1,
     outcome=excluded.outcome,reason=excluded.reason,
     ledger_id=excluded.ledger_id,last_attempt_at=clock_timestamp();
   -- Expose a durable reason to the dashboard if there was no ledger posting.
   -- Keep immutable OCR facts and the pairing preview intact.
   IF v_outcome<>'received' THEN
     UPDATE public.chat_bank_bill_receipts
       SET reason='auto_collect_'||v_outcome||':'||left(v_reason,180),
         raw_read=jsonb_set(raw_read,'{auto_collect_attempt}',
           jsonb_build_object('outcome',v_outcome,'reason',v_reason,
             'notification_id',x.notification_id,'checked_at',clock_timestamp()),true)
     WHERE id=x.receipt_id AND status='amount_read' AND ledger_id IS NULL;
   END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'checked',v_checked,'received',v_received,
    'blocked',v_blocked,'retry',v_failed);
END;
$function$
;

REVOKE ALL ON FUNCTION public.chat_bank_auto_collect_retry(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_auto_collect_retry(integer) TO service_role;
SELECT cron.schedule('taphoa-bank-verified-collect-retry-v1','*/2 * * * *',
 'SELECT public.chat_bank_auto_collect_retry(20);');
