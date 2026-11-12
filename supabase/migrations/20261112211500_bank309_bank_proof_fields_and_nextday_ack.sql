-- BANK-309: Admin read-only proof for deduplicating *actual* bank events,
-- plus explicit customer-facing wording IF a future guarded next-day financial
-- collector has already posted a verified ledger entry.
-- THIS MIGRATION DOES NOT ENABLE NEXT-DAY COLLECTION, CREATE CREDITS, MODIFY
-- EXISTING BANK EVENTS, SEND CUSTOMER MESSAGES, OR CHANGE CUSTOMER DEBT.
-- Requires BANK-306/BANK-307 to be applied in the authorized DB rollout.
BEGIN;
DO $bank309_admin_credit$
DECLARE
  def text;
  updated text;
  anchor text := 'n.fingerprint,n.received_at,';
  addition text := 'n.fingerprint,n.received_at,' ||
    'substring(n.body from ''Số dư cuối:[[:space:]]*([-+]?[0-9,]+)[[:space:]]*VND'') AS bank_balance_text,' ||
    'btrim(split_part(split_part(n.body,''Nội dung giao dịch:'',2),''Số dư cuối:'',1)) AS bank_memo,';
BEGIN
  SELECT pg_get_functiondef('public.chat_bank_all_credit_statuses(uuid,date)'::regprocedure)
  INTO def;
  IF position('bank_balance_text' IN def)>0 THEN RETURN; END IF;
  IF position(anchor IN def)=0 THEN
    RAISE EXCEPTION 'bank309_requires_bank307_admin_credit_fields';
  END IF;
  updated:=replace(def,anchor,addition);
  EXECUTE updated;
END;
$bank309_admin_credit$;

DO $bank309_customer_ack$
DECLARE
  def text;
  updated text;
  source_status text := 'AND r.reason=''agribank_plus_credit_and_bill_matched''';
  nextday_status text :=
    'AND r.reason IN (''agribank_plus_credit_and_bill_matched'',' ||
    '''agribank_plus_credit_missing_bill_hour_next_day'')';
  source_note text := '''Đã đối soát Agribank · Sổ #''||x.ledger_id::text,';
  nextday_note text :=
    'CASE WHEN x.receipt_reason=''agribank_plus_credit_missing_bill_hour_next_day'' ' ||
    'THEN ''Đã thu bù: bill thiếu giờ giao dịch nên hệ thống đợi sang ngày mới ' ||
    '(giờ Việt Nam), đối soát Agribank đủ điều kiện rồi mới tự thu một lần · Sổ #''||x.ledger_id::text ' ||
    'ELSE ''Đã đối soát Agribank · Sổ #''||x.ledger_id::text END,';
BEGIN
  SELECT pg_get_functiondef('public.chat_bank_auto_collection_ack_drain(integer)'::regprocedure)
  INTO def;
  IF position('x.receipt_reason=''agribank_plus_credit_missing_bill_hour_next_day''' IN def)>0 THEN RETURN; END IF;
  IF position('r.balance_before_thousands, r.balance_after_thousands,' IN def)=0
    OR position(source_status IN def)=0 OR position(source_note IN def)=0 THEN
      RAISE EXCEPTION 'bank309_customer_ack_contract_changed';
  END IF;
  -- The existing sent/retry/idempotency checks and the verified ledger JOIN
  -- stay exactly the same. An unposted bill can never reach this template.
  updated:=replace(def,
    'r.balance_before_thousands, r.balance_after_thousands,',
    'r.balance_before_thousands, r.balance_after_thousands,r.reason AS receipt_reason,');
  updated:=replace(updated,source_status,nextday_status);
  updated:=replace(updated,source_note,nextday_note);
  EXECUTE updated;
END;
$bank309_customer_ack$;
COMMIT;
