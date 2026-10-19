-- BANK-171: Agribank notice must name the full receiving account.
-- Customer's photographed bill may be cropped/masked; only readable final 5 digits are checked.
-- Financial posting remains limited to the exact credited account in the bank notification.
begin;
do $patch$
declare
  source text;
  original text := $old$
  -- Some bank screenshots truncate 1-2 characters from the account number.
  -- Only accept a long exact contiguous prefix or suffix of the verified bank account.
  if nullif(btrim(coalesce(r.receiving_account,'')),'') is not null
      and r.receiving_account<>account_number
      and not (
        length(r.receiving_account) between 11 and length(account_number)-1
        and (left(account_number,length(r.receiving_account))=r.receiving_account
           or right(account_number,length(r.receiving_account))=r.receiving_account)
      )
  then return jsonb_build_object('ok',false,'status','recipient_account_conflict'); end if;
$old$;
  revised text := $new$
  -- A customer receipt may show only *****99999 or a partly misread full account.
  -- Last five digits are optional supporting evidence; full account comes from Agribank.
  if nullif(btrim(coalesce(r.receiving_account,'')),'') is not null
    and length(regexp_replace(r.receiving_account,'[^0-9]','','g'))>=5
    and right(regexp_replace(r.receiving_account,'[^0-9]','','g'),5)<>right(account_number,5)
  then return jsonb_build_object('ok',false,'status','recipient_account_conflict'); end if;
$new$;
begin
  source:=pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure);
  if position(original in source)=0 or position('account_number<>''2901181999999''' in source)=0
    or position('n.is_own_transfer=true' in source)=0 then
    raise exception 'bank171_authorization_guard_changed';
  end if;
  execute replace(source,original,revised);
end
$patch$;
commit;