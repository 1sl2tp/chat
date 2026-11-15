-- BANK-362: versioned migration, same-transaction ACK for verified
-- collections created by the existing two-minute financial-retry cron.
-- Apply only through versioned Supabase migration; never direct ledger SQL.
--
-- Why: receipt/ledger rows can be committed by chat_bank_auto_collect_retry()
-- at e.g. 18:34, while the independent ACK cron runs at 18:36.
-- This wrapper does NOT authorize a collection: it only invokes the existing
-- guarded financial retry, then the existing idempotent customer ACK drain.
-- No new cron, new privilege, new ledger writer, bank proof relaxation,
-- customer message template, or synthetic transaction.

DO $preflight$
DECLARE
  j record;
BEGIN
  SELECT jobid, jobname, schedule, command, active INTO j
  FROM cron.job WHERE jobname = 'taphoa-bank-verified-collect-retry-v1';
  IF NOT FOUND OR NOT j.active OR j.schedule <> '*/2 * * * *'
     OR j.command NOT IN (
       'SELECT public.chat_bank_auto_collect_retry(20);',
       'SELECT v21_private.bank362_retry_collect_and_ack();'
     ) THEN
    RAISE EXCEPTION 'bank362_financial_retry_cron_contract_changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'taphoa-bank-auto-collection-ack-v1'
      AND active = true AND schedule = '*/2 * * * *'
      AND command = 'SELECT public.chat_bank_auto_collection_ack_drain(20);'
  ) THEN RAISE EXCEPTION 'bank362_ack_fallback_cron_missing'; END IF;
  IF to_regprocedure('public.chat_bank_auto_collect_retry(integer)') IS NULL
     OR to_regprocedure('public.chat_bank_auto_collection_ack_drain(integer)') IS NULL
  THEN RAISE EXCEPTION 'bank362_guarded_rpc_contract_missing'; END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION v21_private.bank362_retry_collect_and_ack()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
DECLARE
  v_collect jsonb;
  v_ack jsonb;
BEGIN
  -- Financial authority, proof matching, idempotency, Admin controls and
  -- all safety rules remain solely inside chat_bank_auto_collect_retry().
  v_collect := public.chat_bank_auto_collect_retry(20);

  IF v_collect->>'ok' = 'true'
     AND COALESCE((v_collect->>'received')::integer, 0) > 0 THEN
    BEGIN
      -- Same transaction / same commit for ledger and Chat. The drain
      -- rechecks the canonical bank notice, receipt, ledger and opt-in.
      -- Another parallel ACK cron cannot duplicate this message.
      v_ack := public.chat_bank_auto_collection_ack_drain(30);
    EXCEPTION WHEN OTHERS THEN
      -- PostgreSQL subtransaction rolls back ONLY ACK attempt. Financial
      -- posting stays valid and the original ACK cron can recover it.
      -- Never log customer/amount/transfer details.
      RAISE WARNING 'bank362_ack_fallback_sqlstate_%', SQLSTATE;
    END;
  END IF;
  RETURN COALESCE(v_collect, jsonb_build_object('ok', false, 'reason', 'missing_result'))
      || jsonb_build_object('ack_triggered',
           v_ack IS NOT NULL AND v_ack->>'ok' = 'true');
END;
$function$;

REVOKE ALL ON FUNCTION v21_private.bank362_retry_collect_and_ack()
  FROM PUBLIC, anon, authenticated;

DO $switch$
DECLARE j record;
BEGIN
  SELECT jobid, schedule, command, active INTO j
  FROM cron.job
  WHERE jobname = 'taphoa-bank-verified-collect-retry-v1';
  IF NOT FOUND OR NOT j.active OR j.schedule <> '*/2 * * * *'
  THEN RAISE EXCEPTION 'bank362_retry_job_changed_during_release'; END IF;
  IF j.command = 'SELECT v21_private.bank362_retry_collect_and_ack();'
  THEN RETURN; END IF;
  IF j.command <> 'SELECT public.chat_bank_auto_collect_retry(20);'
  THEN RAISE EXCEPTION 'bank362_retry_job_command_changed'; END IF;
  -- Update the EXISTING job by id, preserve its two-minute schedule and
  -- the original separate ACK fallback job unchanged.
  PERFORM cron.alter_job(
    job_id => j.jobid,
    command => 'SELECT v21_private.bank362_retry_collect_and_ack();'
  );
END;
$switch$;

-- E3 migration readback:
-- SELECT jobname, schedule, command, active FROM cron.job
-- WHERE jobname IN ('taphoa-bank-verified-collect-retry-v1',
--                   'taphoa-bank-auto-collection-ack-v1');
-- E4: compare ledger.created_at, ack.message_id -> message.created_at,
-- and admin push queued/processed timestamps for NEW real verified receipts.
-- Never replay old received bills, fabricate money or resend customer messages.
