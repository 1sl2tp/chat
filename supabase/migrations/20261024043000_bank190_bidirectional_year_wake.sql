-- BANK-190: symmetric, server-side OCR year error wakeups.
-- A delayed Agribank notice or a newly scanned customer image can wake
-- the BANK-189 fully guarded verifier without re-running Gemini.
-- NEVER relax BANK-174 current-day collection or guess an ambiguous match.
create or replace function v21_private.bank190_on_bank_notice()
returns trigger language plpgsql security definer
set search_path=public,v21_private,extensions,pg_temp
as $fn$
declare candidate record; verified jsonb;
begin
 if new.status<>'credit_candidate'
   or new.package_name<>'com.vnpay.Agribank3g'
   or new.is_own_transfer is distinct from false
   or new.bank_credit_account<>'2901181999999'
   or new.amount_vnd is null or new.amount_vnd<=0 or new.transfer_at is null
 then return new; end if;
 for candidate in
   select r.media_asset_id
   from public.chat_bank_bill_receipts r
   where r.status='amount_read' and r.ledger_id is null
     and r.amount_vnd=new.amount_vnd
     and r.transfer_at_vn is not null
     and r.sent_at between new.transfer_at-interval '5 minutes'
                       and new.transfer_at+interval '5 minutes'
     and extract(year from r.transfer_at_vn)<>
       extract(year from new.transfer_at at time zone 'Asia/Ho_Chi_Minh')
     and to_char(r.transfer_at_vn,'MM-DD HH24:MI')=
       to_char(new.transfer_at at time zone 'Asia/Ho_Chi_Minh','MM-DD HH24:MI')
   order by r.sent_at,r.id limit 3
 loop
   begin
     verified:=public.chat_bank_reconcile_ocr_year(candidate.media_asset_id,new.id);
   exception when others then
     raise warning 'bank190_notice_year_check_failed: %',sqlstate;
   end;
 end loop;
 return new;
end
$fn$;
revoke all on function v21_private.bank190_on_bank_notice() from public,anon,authenticated;
drop trigger if exists bank190_verify_ocr_year_on_credit on public.taphoa_agribank_notifications;
create trigger bank190_verify_ocr_year_on_credit
after insert on public.taphoa_agribank_notifications
for each row execute function v21_private.bank190_on_bank_notice();

create or replace function v21_private.bank190_on_bill_read()
returns trigger language plpgsql security definer
set search_path=public,v21_private,extensions,pg_temp
as $fn$
declare candidate record; verified jsonb;
begin
 if new.status<>'amount_read' or old.status='amount_read'
    or new.ledger_id is not null or new.amount_vnd is null
    or new.amount_vnd<=0 or new.transfer_at_vn is null
 then return new; end if;
 for candidate in
   select n.id from public.taphoa_agribank_notifications n
   where n.status='credit_candidate'
     and n.package_name='com.vnpay.Agribank3g'
     and n.is_own_transfer is false
     and n.bank_credit_account='2901181999999'
     and n.amount_vnd=new.amount_vnd
     and n.transfer_at between new.sent_at-interval '5 minutes'
                           and new.sent_at+interval '5 minutes'
     and extract(year from new.transfer_at_vn)<>
       extract(year from n.transfer_at at time zone 'Asia/Ho_Chi_Minh')
     and to_char(new.transfer_at_vn,'MM-DD HH24:MI')=
       to_char(n.transfer_at at time zone 'Asia/Ho_Chi_Minh','MM-DD HH24:MI')
   order by n.transfer_at,n.id limit 3
 loop
   begin
     verified:=public.chat_bank_reconcile_ocr_year(new.media_asset_id,candidate.id);
   exception when others then
     raise warning 'bank190_bill_year_check_failed: %',sqlstate;
   end;
 end loop;
 return new;
end
$fn$;
revoke all on function v21_private.bank190_on_bill_read() from public,anon,authenticated;
drop trigger if exists bank190_verify_ocr_year_on_bill on public.chat_bank_bill_receipts;
create trigger bank190_verify_ocr_year_on_bill
after update of status on public.chat_bank_bill_receipts
for each row execute function v21_private.bank190_on_bill_read();
