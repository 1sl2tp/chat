-- BANK-214: Distinguish transfers using time + reference + sender-bank identity.
-- Equal monetary value on different dates/times is not a duplicate.
-- Competing bills in the SAME bank-printed minute remain review-only until
-- uniquely bank-confirmed; matching reference/day/bank is a duplicate receipt.
-- Never create, update or link ledger balances here.
DO $bank214$
DECLARE
  fn text;
  old_guard text;
  new_guard text;
BEGIN
  SELECT pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure) INTO fn;
  IF position('BANK-214: same-amount transactions are not automatically duplicates' IN fn)>0 THEN
    RETURN;
  END IF;
  old_guard := $old$
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and (
         (o.image_sha256 is not null and o.image_sha256=r.image_sha256)
         or (o.amount_vnd=r.amount_vnd and o.status in ('amount_read','review','received','historical_reference')
              and o.transfer_at_vn between r.transfer_at_vn-interval '5 minutes' and r.transfer_at_vn+interval '5 minutes')
       ))
    or exists(select 1 from public.taphoa_agribank_notifications o
       where o.id<>n.id and o.status='credit_candidate' and o.amount_vnd=n.amount_vnd
         and o.transfer_at between n.transfer_at-interval '5 minutes' and n.transfer_at+interval '5 minutes')
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and o.status in ('queued','scanning')
         and o.sent_at between r.sent_at-interval '3 minutes' and r.sent_at+interval '3 minutes')
$old$;
  new_guard := $new$
    -- BANK-214: same-amount transactions are not automatically duplicates.
    -- Require the same strong bank reference/date/origin, an identical image,
    -- or a competing claim on the SAME one-minute bank proof.
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and (
         (o.image_sha256 is not null and o.image_sha256=r.image_sha256)
         or (o.amount_vnd=r.amount_vnd and o.status in ('amount_read','review','received','historical_reference')
           and (
             o.transfer_at_vn between r.transfer_at_vn-interval '60 seconds'
               and r.transfer_at_vn+interval '60 seconds'
             or (
               nullif(btrim(o.transfer_reference),'') is not null
               and nullif(btrim(r.transfer_reference),'') is not null
               and upper(btrim(o.transfer_reference))=upper(btrim(r.transfer_reference))
               and o.transfer_at_vn::date=r.transfer_at_vn::date
               and (
                 nullif(btrim(o.sending_bank),'') is null
                 or nullif(btrim(r.sending_bank),'') is null
                 or upper(btrim(o.sending_bank))=upper(btrim(r.sending_bank))
               )
             )
           ))
       ))
    or exists(select 1 from public.taphoa_agribank_notifications o
       where o.id<>n.id and o.status='credit_candidate' and o.amount_vnd=n.amount_vnd
         and o.transfer_at between n.transfer_at-interval '60 seconds' and n.transfer_at+interval '60 seconds')
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and o.customer_account_id=r.customer_account_id
         and o.status in ('queued','scanning')
         and o.sent_at between r.sent_at-interval '3 minutes' and r.sent_at+interval '3 minutes')
$new$;
  IF position(old_guard IN fn)=0
    OR position('pg_advisory_xact_lock(17812026)' IN fn)=0
    OR position('already_manual_collected' IN fn)=0
    OR position('insert into public.chat_bank_app_collection_links' IN fn)=0
    OR position('bill_outside_current_business_day' IN fn)=0
  THEN RAISE EXCEPTION 'bank214_money_writer_contract_mismatch'; END IF;
  fn:=replace(fn,old_guard,new_guard);
  EXECUTE fn;
END;
$bank214$;