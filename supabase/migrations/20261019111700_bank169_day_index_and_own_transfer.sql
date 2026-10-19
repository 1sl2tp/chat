-- BANK-169: Preserve Android upload timestamps as audit facts; index BANK-PRINTED transaction day/time.
-- All historical notifications are kept; personal internal transfers remain saved but excluded from cash collection.
begin;
create or replace function public.chat_agribank_own_transfer(p_body text)
returns boolean language sql immutable security invoker
set search_path to 'pg_catalog','pg_temp'
as $fn$
  select coalesce(
    substring(coalesce(p_body,'') from 'Nội dung giao dịch:[[:space:]]*([^\r\n.]+)') ~* 'BUI[[:space:]]+XUAN[[:space:]]+TUNG',
    false
  )
$fn$;
revoke all on function public.chat_agribank_own_transfer(text) from public,anon,authenticated;
grant execute on function public.chat_agribank_own_transfer(text) to service_role;
alter table public.taphoa_agribank_notifications
  add column if not exists transfer_at timestamptz
    generated always as (public.chat_agribank_transfer_at(body)) stored,
  add column if not exists is_own_transfer boolean
    generated always as (public.chat_agribank_own_transfer(body)) stored;
create index if not exists taphoa_agribank_credit_transaction_idx
  on public.taphoa_agribank_notifications(amount_vnd,transfer_at,id)
  where status='credit_candidate' and is_own_transfer=false;
commit;