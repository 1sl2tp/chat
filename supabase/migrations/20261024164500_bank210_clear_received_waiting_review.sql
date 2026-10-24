-- BANK-210: A matching bank notification is NOT by itself a posted receipt.
-- "Đã thu" requires the verified bank link + exact customer ledger movement.
-- If Agribank credit exists at the same amount/time but bill is unverified,
-- show "Cần kiểm tra", not the misleading "Chờ Agribank".
DO $$
DECLARE fn text;
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_dashboard(uuid,date)'::regprocedure) INTO fn;
 IF position('BANK-210: verified posted collection status' in fn)>0 THEN RETURN; END IF;
 IF position('WHEN n.id IS NOT NULL AND r.status=''received'' THEN ''matched''' in fn)=0
 OR position('LEFT JOIN public.taphoa_agribank_notifications n ON n.id=l.notification_id' in fn)=0
 OR position('r.receiving_account, r.transfer_reference,' in fn)=0
 OR position('WHEN r.status=''amount_read'' AND r.transfer_at_vn::date=p_day THEN ''waiting_bank''' in fn)=0
 THEN RAISE EXCEPTION 'bank210_dashboard_source_changed'; END IF;

 fn:=replace(fn,' r.receiving_account, r.transfer_reference,',
 ' r.receiving_account, r.transfer_reference,
'||
 ' l.ledger_id::text ledger_id,
'||
 ' exists(SELECT 1 FROM public.v21_messages msg WHERE msg.client_id=''taphoa:''||r.id::text||'':collection'' AND msg.deleted_at IS NULL) collection_ack_sent,
'||
 ' -- BANK-210: verified posted collection status
');
 fn:=replace(fn,
  ' LEFT JOIN public.taphoa_agribank_notifications n ON n.id=l.notification_id',
  ' LEFT JOIN public.taphoa_agribank_notifications n ON n.id=l.notification_id
'||
  ' LEFT JOIN public.taphoa_debt_ledger d ON d.id=l.ledger_id
'||
  '    AND d.customer_account_id=r.customer_account_id AND d.entry_type=''collection''
'||
  '    AND d.amount_vnd=-(r.amount_vnd::numeric/1000)');
 fn:=replace(fn,
  'WHEN n.id IS NOT NULL AND r.status=''received'' THEN ''matched''',
  'WHEN n.id IS NOT NULL AND r.status=''received'' AND r.ledger_id=l.ledger_id
'||
  '  AND d.id IS NOT NULL AND n.amount_vnd=r.amount_vnd THEN ''matched''');
 fn:=replace(fn,
  'WHEN r.status=''amount_read'' AND r.transfer_at_vn::date=p_day THEN ''waiting_bank''',
  'WHEN r.status=''amount_read'' AND r.transfer_at_vn::date=p_day
'||
  ' AND EXISTS(SELECT 1 FROM public.taphoa_agribank_notifications possible
'||
  ' WHERE possible.status=''credit_candidate'' AND possible.is_own_transfer IS FALSE
'||
  ' AND possible.bank_credit_account=''2901181999999''
'||
  ' AND possible.amount_vnd=r.amount_vnd AND possible.transfer_at IS NOT NULL
'||
  ' AND abs(extract(epoch FROM ((possible.transfer_at AT TIME ZONE ''Asia/Ho_Chi_Minh'')-r.transfer_at_vn)))<=300)
'||
  ' THEN ''review''
'||
  ' WHEN r.status=''amount_read'' AND r.transfer_at_vn::date=p_day THEN ''waiting_bank''');
 EXECUTE fn;
END $$;

-- Keep the summary of "bill chưa ghi thu" aligned with the table, including
-- images whose transaction time is missing (but never a prior-day bill).
DO $$
DECLARE fn text; old_filter text;
BEGIN
 SELECT pg_get_functiondef('v21_private.chat_bank_report_snapshot(date)'::regprocedure) INTO fn;
 IF position('BANK-210: no-time bill is not a confirmed receipt' in fn)>0 THEN RETURN; END IF;
 old_filter:='r.transfer_at_vn::date=p_day AND NOT EXISTS';
 IF (length(fn)-length(replace(fn,old_filter,'')))/length(old_filter)<>2 THEN
    RAISE EXCEPTION 'bank210_snapshot_filter_changed';
 END IF;
 fn:=replace(fn,old_filter,
   '(r.transfer_at_vn IS NULL OR r.transfer_at_vn::date=p_day) AND NOT EXISTS');
 fn:=replace(fn,'WITH bank AS (',
  '/* BANK-210: no-time bill is not a confirmed receipt */ WITH bank AS (');
 -- Require the actual linked ledger and verified amount to count as collected.
 IF position('FROM public.chat_bank_app_collection_links l' in fn)=0 THEN
    RAISE EXCEPTION 'bank210_snapshot_link_source_changed';
 END IF;
 fn:=replace(fn,
  'JOIN bank n ON n.id=l.notification_id',
  'JOIN bank n ON n.id=l.notification_id
 JOIN public.taphoa_debt_ledger d ON d.id=l.ledger_id');
 fn:=replace(fn,
  'WHERE r.amount_vnd=n.amount_vnd',
  'WHERE r.status=''received'' AND r.ledger_id=l.ledger_id
'||
  '   AND d.customer_account_id=r.customer_account_id
'||
  '   AND d.entry_type=''collection'' AND d.amount_vnd=-(r.amount_vnd::numeric/1000)
'||
  '   AND r.amount_vnd=n.amount_vnd');
 EXECUTE fn;
END $$;
