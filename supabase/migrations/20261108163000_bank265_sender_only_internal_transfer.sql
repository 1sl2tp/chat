-- BANK-265: An incoming Agribank credit can contain the BENEFICIARY name
-- after "chuyen tien den". That must not make the sender an own-transfer.
-- Only a memo whose sender begins with the configured account-holder name
-- continues to be classed as a personal/internal transfer.
-- Do not broaden the amount/date/recipient/duplicate checks downstream.
begin;
create or replace function public.chat_agribank_own_transfer(p_body text)
returns boolean language sql immutable security invoker
set search_path to 'pg_catalog','pg_temp'
as $fn$
  select coalesce(
    btrim(substring(coalesce(p_body,'') from 'Nội dung giao dịch:[[:space:]]*([^\r\n.]+)'))
      ~* '^BUI[[:space:]]+XUAN[[:space:]]+TUNG([[:space:][:punct:]]|$)',
    false
  )
$fn$;
revoke all on function public.chat_agribank_own_transfer(text) from public,anon,authenticated;
grant execute on function public.chat_agribank_own_transfer(text) to service_role;
commit;
