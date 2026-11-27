-- Apply only after exact-head CI; retain existing mode and grants. No financial writes.
begin;
create or replace function public.v0_bill_focus_seed(p_limit integer default 20) returns integer
language plpgsql security definer set search_path='' as $q$
declare n integer;
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_limit';end if;
 insert into v0_private.bill_focused_reread(receipt_id,raw_hash,image_sha256,field)
 select r.id,md5(r.raw_read::text),r.image_sha256,f.field
 from public.chat_bank_bill_receipts r
 join public.v21_media_assets a on a.id=r.media_asset_id and a.message_id=r.message_id and a.owner_account_id=r.customer_account_id and a.deleted_at is null
 cross join (values ('account'),('small_text')) f(field)
 where v0_private.bill_focus_allowed(r.id) and r.status in ('received','amount_read','review','duplicate') and r.image_sha256 ~ '^[a-f0-9]{64}$'
 and r.raw_read->>'transfer_success_visible'='true'
 and ((f.field='account' and (v0_private.bill_focus_retryable(r.raw_read->>'account_digit_recheck_state') or r.raw_read->>'account_digit_recheck_state'='digit_evidence_disagrees'))
 or (f.field='small_text' and v0_private.bill_focus_retryable(r.raw_read->>'small_text_recheck_state')))
 and not exists(select 1 from v0_private.bill_focused_reread q where q.receipt_id=r.id and q.raw_hash=md5(r.raw_read::text) and q.field=f.field)
 order by case when f.field='account' then 0 else 1 end,r.sent_at desc nulls last,r.id
 limit p_limit on conflict(receipt_id,raw_hash,field) do nothing;
 get diagnostics n=row_count;return n;
end $q$;
commit;
