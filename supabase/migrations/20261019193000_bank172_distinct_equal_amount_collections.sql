-- BANK-172: repeated amount is not the same transfer.
-- Two official bank credits can legitimately have equal VND amount while having
-- distinct notification IDs, distinct bank transaction clocks and distinct bill photos.
-- Avoid treating an earlier already-linked automatic collection as a manual collection.
-- Preserve manual cash collection protection, unique receipt/notice links, and M1 checks.
begin;
do $patch$
declare
  fn text;
  old_guard text := $old$
  -- Hold when operator may have manually collected the same transfer.
  if exists(select 1 from public.taphoa_debt_ledger l
      where l.customer_account_id=customer and l.entry_type='collection'
        and l.amount_vnd=-thousands
        and l.created_at between transaction_at-interval '30 minutes' and now())
  then return jsonb_build_object('ok',false,'status','possible_manual_collection'); end if;
$old$;
  new_guard text := $new$
  -- Hold only for a manual/unlinked collection of the same amount near this bank
  -- transfer. An earlier AUTO collection, linked to a DIFFERENT consumed Agribank
  -- notification, must not block an independent transfer of the same amount.
  if exists(
    select 1 from public.taphoa_debt_ledger l
    where l.customer_account_id=customer
      and l.entry_type='collection'
      and l.amount_vnd=-thousands
      and l.created_at between transaction_at-interval '30 minutes' and now()
      and not exists (
        select 1 from public.chat_bank_app_collection_links previous_auto
        where previous_auto.ledger_id=l.id
      )
  ) then
    return jsonb_build_object('ok',false,'status','possible_manual_collection');
  end if;
$new$;
begin
  fn:=pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure);
  if position(old_guard in fn)=0 then
    raise exception 'bank172_existing_manual_guard_changed';
  end if;
  if position('l.notification_id=n.id or l.receipt_id=r.id' in fn)=0
     or position('o.transfer_at between n.transfer_at' in fn)=0
     or position('n.is_own_transfer=true' in fn)=0
     or position('account_number<>''2901181999999''' in fn)=0
     or position('r.raw_read#>>''{match_preview,notification_id}'' is distinct from p_notification_id::text' in fn)=0
  then
    raise exception 'bank172_required_bank_safety_gates_missing';
  end if;
  fn:=replace(fn,old_guard,new_guard);
  execute fn;
end;
$patch$;
commit;