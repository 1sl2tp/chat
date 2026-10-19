-- BANK-169: Parse the bank's original transaction timestamp from its credit notice.
-- Keep Android posted_at and Supabase received_at unchanged for audit.
begin;
create or replace function public.chat_agribank_transfer_at(p_body text)
returns timestamptz language plpgsql immutable security invoker
set search_path to 'pg_catalog','pg_temp'
as $fn$
declare d text[]; value timestamptz;
begin
  d:=regexp_match(p_body,
    'Agribank:[[:space:]]*([01][0-9]|2[0-3]):([0-5][0-9])[[:space:]]+([0-2][0-9]|3[01])/([01][0-9])/([0-9]{4})','i');
  if d is null then return null; end if;
  value:=make_timestamp(d[5]::int,d[4]::int,d[3]::int,
    d[1]::int,d[2]::int,0) at time zone 'Asia/Ho_Chi_Minh';
  return value;
exception when datetime_field_overflow or invalid_datetime_format then return null;
end;
$fn$;
revoke all on function public.chat_agribank_transfer_at(text) from public,anon,authenticated;
grant execute on function public.chat_agribank_transfer_at(text) to service_role;
commit;