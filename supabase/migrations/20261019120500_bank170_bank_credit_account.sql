-- BANK-170: one Agribank Plus app can emit credits for multiple bank accounts.
-- Persist every bank notice, but only the authorized receiving account is a TAPHOA collection candidate.
begin;
alter table public.taphoa_agribank_notifications
 add column if not exists bank_credit_account text
 generated always as (
   substring(body from 'Tài khoản[[:space:]]+([0-9]{9,20})[[:space:]]*:[[:space:]]*[+]')
 ) stored;
create index if not exists taphoa_agribank_authorized_account_time_idx
 on public.taphoa_agribank_notifications(bank_credit_account,amount_vnd,transfer_at,id)
 where status='credit_candidate' and is_own_transfer=false;
commit;