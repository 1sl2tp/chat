-- BANK-364 · 16/11/2026 · A pending *different* bill of the same customer
-- is temporarily ambiguous, not a permanent financial rejection. Keep the
-- full canonical chat_bank_app_collect() untouched: this migration modifies
-- ONLY its caller's retry outcome for a concurrent queued/scanning peer.
-- No ledger DML, no new cron, no new privilege, no bypass of today's bank proof.
DO $patch$
DECLARE
  fn text;
  needle text := E'     ELSE\n       v_outcome:=\'blocked\';v_reason:=left(v_status,180);\n       v_blocked:=v_blocked+1;\n     END IF;';
  replacement text := E'     ELSE\n       -- BANK-364: retry, do NOT collect, if another bill scan was transiently pending.\n       IF v_status=\'duplicate_or_ambiguous\' AND EXISTS (\n         SELECT 1 FROM public.chat_bank_bill_receipts pending\n         JOIN public.chat_bank_bill_receipts current_receipt\n           ON current_receipt.id=x.receipt_id\n         WHERE pending.id<>current_receipt.id\n           AND pending.customer_account_id=current_receipt.customer_account_id\n           AND pending.status IN (\'queued\',\'scanning\')\n           AND pending.sent_at BETWEEN current_receipt.sent_at - interval \'3 minutes\'\n                                   AND current_receipt.sent_at + interval \'3 minutes\'\n       ) THEN\n         v_outcome:=\'retry\';v_reason:=\'same_customer_peer_scan_pending\';\n         v_failed:=v_failed+1;\n       ELSE\n         v_outcome:=\'blocked\';v_reason:=left(v_status,180);\n         v_blocked:=v_blocked+1;\n       END IF;\n     END IF;';
BEGIN
  SELECT pg_get_functiondef('public.chat_bank_auto_collect_retry(integer)'::regprocedure) INTO fn;
  IF fn IS NULL THEN RAISE EXCEPTION 'bank364_retry_rpc_missing'; END IF;
  IF position('BANK-364: retry' in fn)>0 THEN RETURN; END IF;
  IF position(needle in fn)=0
     OR position('pg_try_advisory_xact_lock(17812094)' in fn)=0
     OR position('chat_bank_app_collect(x.media_asset_id,x.notification_id)' in fn)=0
     OR position('a.outcome=''retry''' in fn)=0
  THEN RAISE EXCEPTION 'bank364_live_financial_retry_contract_drift'; END IF;
  EXECUTE replace(fn,needle,replacement);
END;
$patch$;
