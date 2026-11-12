-- BANK-306: one official Agribank notification across all APK/device identities.
-- Historical rows, including already-linked ledger records, are NEVER deleted.
-- Missing/balance-gap hints are READ ONLY; they are not bank credits.
BEGIN;

CREATE INDEX IF NOT EXISTS bank306_notification_global_fingerprint_idx
 ON public.taphoa_agribank_notifications(fingerprint);

CREATE OR REPLACE FUNCTION v21_private.bank306_ignore_duplicate_notification()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO 'pg_catalog','public','pg_temp'
AS $bank306_trigger$
BEGIN
 -- Serialize identical fingerprints so simultaneous mobile replay cannot race.
 -- Hash collisions only serialize transactions; the equality check is exact.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.fingerprint,306));
 IF EXISTS (
    SELECT 1 FROM public.taphoa_agribank_notifications prior
    WHERE prior.fingerprint=NEW.fingerprint
 ) THEN RETURN NULL; END IF;
 RETURN NEW;
END;
$bank306_trigger$;
REVOKE ALL ON FUNCTION v21_private.bank306_ignore_duplicate_notification() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank306_prevent_device_replay_trg ON public.taphoa_agribank_notifications;
CREATE TRIGGER bank306_prevent_device_replay_trg
 BEFORE INSERT ON public.taphoa_agribank_notifications
 FOR EACH ROW EXECUTE FUNCTION v21_private.bank306_ignore_duplicate_notification();

-- Existing bank reports must treat duplicate-device rows as one bank event.
-- When a historical duplicate has an actual verified collection link, select
-- that row as canonical rather than re-attaching any financial record.
DO $bank306_patch$
DECLARE
  canonical text := $canonical$
    /* BANK-306 canonical fingerprint across devices; no financial writes */
    SELECT DISTINCT ON (c.fingerprint) c.*
    FROM public.taphoa_agribank_notifications c
    WHERE c.status='credit_candidate'
      AND c.is_own_transfer IS FALSE
      AND c.bank_credit_account='2901181999999'
    ORDER BY c.fingerprint,
      CASE WHEN EXISTS(
          SELECT 1 FROM public.chat_bank_app_collection_links l
          WHERE l.notification_id=c.id
        ) OR EXISTS(
          SELECT 1 FROM public.chat_bank_manual_collections m
          WHERE m.notification_id=c.id
        ) THEN 0 ELSE 1 END,
      c.id ASC
$canonical$;
  prior text;
  updated text;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_all_credit_statuses(uuid,date)'::regprocedure) INTO prior;
 IF position('BANK-306 canonical fingerprint' IN prior)=0 THEN
   updated:=replace(prior,
    'FROM public.taphoa_agribank_notifications n',
    'FROM ('||canonical||') n');
   IF updated=prior THEN RAISE EXCEPTION 'bank306_all_credits_anchor_missing'; END IF;
   EXECUTE updated;
 END IF;
 SELECT pg_get_functiondef('public.chat_bank_dashboard(uuid,date)'::regprocedure) INTO prior;
 IF position('BANK-306 canonical fingerprint' IN prior)=0 THEN
   updated:=replace(prior,
    'FROM public.taphoa_agribank_notifications n',
    'FROM ('||canonical||') n');
   IF updated=prior THEN RAISE EXCEPTION 'bank306_dashboard_anchor_missing'; END IF;
   EXECUTE updated;
 END IF;
 SELECT pg_get_functiondef('v21_private.chat_bank_report_snapshot(date)'::regprocedure) INTO prior;
 IF position('BANK-306 canonical fingerprint' IN prior)=0 THEN
   updated:=replace(prior,
    'SELECT n.* FROM public.taphoa_agribank_notifications n',
    'SELECT n.* FROM ('||canonical||') n');
   IF updated=prior THEN RAISE EXCEPTION 'bank306_snapshot_anchor_missing'; END IF;
   EXECUTE updated;
 END IF;
END;
$bank306_patch$;

-- This endpoint may report a potential missing official bank notification when
-- the difference between successive verified bank balances cannot be explained
-- by the later recorded credit. NO ledger creation, NO bank event synthesis.
-- A gap could instead reflect multiple transfers, fees or intervening debits.
CREATE OR REPLACE FUNCTION public.chat_bank_missing_credit_candidates(
  p_app_session_id uuid, p_day date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public','v21_private','auth','pg_temp'
AS $bank306_alert$
DECLARE
  v_admin uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_result jsonb;
BEGIN
  v_admin:=v21_private.require_active_account(p_app_session_id);
  IF NOT EXISTS (
     SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
       AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL
  ) THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
  IF p_day<date '2026-10-19' OR p_day>v_today
  THEN RAISE EXCEPTION 'date_out_of_range'; END IF;
  WITH canonical AS (
    SELECT DISTINCT ON (n.fingerprint) n.*
    FROM public.taphoa_agribank_notifications n
    WHERE n.status='credit_candidate'
      AND n.is_own_transfer IS FALSE
      AND n.bank_credit_account='2901181999999'
      AND n.transfer_at >= ((p_day::timestamp - interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND n.transfer_at < (((p_day+1)::timestamp) AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ORDER BY n.fingerprint,n.id
  ), balances AS (
    SELECT n.id,n.bank_credit_account,n.transfer_at,n.amount_vnd,
      nullif(replace(substring(n.body FROM
        'Số dư cuối:[[:space:]]*([-+]?[0-9,]+)[[:space:]]*VND'),',',''),'')::bigint
        AS balance_after_vnd
    FROM canonical n
  ), pairs AS (
    SELECT b.*,
      lag(b.transfer_at) OVER w AS previous_at,
      lag(b.balance_after_vnd) OVER w AS previous_balance_vnd
    FROM balances b
    WINDOW w AS (PARTITION BY b.bank_credit_account ORDER BY b.transfer_at,b.id)
  ), gaps AS (
    SELECT p.id AS next_notice_id,p.previous_at,p.transfer_at AS next_at,
      p.previous_balance_vnd,p.balance_after_vnd,
      p.balance_after_vnd-p.previous_balance_vnd-p.amount_vnd AS gap_vnd
    FROM pairs p
    WHERE p.previous_at IS NOT NULL
      AND p.balance_after_vnd IS NOT NULL
      AND p.previous_balance_vnd IS NOT NULL
      AND p.transfer_at-p.previous_at <= interval '8 hours'
      AND (p.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day
      AND p.balance_after_vnd-p.previous_balance_vnd-p.amount_vnd BETWEEN 1000 AND 999999999999
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.next_at,x.next_notice_id),'[]'::jsonb)
  INTO v_result
  FROM (
     SELECT g.next_notice_id::text AS next_notice_id,
       (g.previous_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::text AS previous_bank_time,
       (g.next_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::text AS next_bank_time,
       g.gap_vnd,r.id::text AS receipt_id,a.display_name AS customer_name,
       'balance_gap_needs_review'::text AS evidence_status,
       false AS financial_authorized
     FROM gaps g
     LEFT JOIN LATERAL (
       SELECT b.id,b.customer_account_id
       FROM public.chat_bank_bill_receipts b
       WHERE b.amount_vnd=g.gap_vnd
         AND b.ledger_id IS NULL
         AND b.status IN ('amount_read','review')
         AND b.transfer_at_vn BETWEEN
           ((g.previous_at AT TIME ZONE 'Asia/Ho_Chi_Minh')-interval '2 minutes')
           AND ((g.next_at AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '2 minutes')
       ORDER BY b.sent_at ASC,b.id
       LIMIT 1
     ) r ON TRUE
     LEFT JOIN public.v21_accounts a ON a.id=r.customer_account_id
     ORDER BY g.next_at DESC,g.next_notice_id DESC
     LIMIT 20
  ) x;
  RETURN v_result;
END;
$bank306_alert$;
REVOKE ALL ON FUNCTION public.chat_bank_missing_credit_candidates(uuid,date)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_bank_missing_credit_candidates(uuid,date) TO authenticated;
COMMIT;
