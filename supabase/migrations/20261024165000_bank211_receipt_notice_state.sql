-- BANK-211: make explicit whether an acknowledged collection's Chat notice
-- is delivered, disabled by recipient settings, or retrying. Nothing here
-- writes ledger entries or changes reconciliation evidence.
DO $$
DECLARE fn text;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_dashboard(uuid,date)'::regprocedure) INTO fn;
 IF position('BANK-211: acknowledgement delivery state' in fn)>0 THEN RETURN; END IF;
 IF position('l.ledger_id::text ledger_id,' in fn)=0
    OR position('LEFT JOIN public.taphoa_debt_ledger d ON d.id=l.ledger_id' in fn)=0
 THEN RAISE EXCEPTION 'bank211_dashboard_source_changed'; END IF;
 fn:=replace(fn,
  'l.ledger_id::text ledger_id,',
  'l.ledger_id::text ledger_id,'||E'\n'||
  ' coalesce(ack.status,''pending'') collection_notice_state,'||E'\n'||
  ' -- BANK-211: acknowledgement delivery state');
 fn:=replace(fn,
  'LEFT JOIN public.taphoa_debt_ledger d ON d.id=l.ledger_id',
  'LEFT JOIN public.chat_bank_auto_collection_ack ack ON ack.receipt_id=r.id'
  ||E'\n'||' LEFT JOIN public.taphoa_debt_ledger d ON d.id=l.ledger_id');
 EXECUTE fn;
END $$;
