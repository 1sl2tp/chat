-- BANK-169: financial matching uses bank-printed transaction time, never delivery timestamps.
begin;
do $patch$
declare definition text;
  old_times text:=E'  if abs(extract(epoch from(n.posted_at-transaction_at)))>900\n     or abs(extract(epoch from(image_at-transaction_at)))>300\n     or r.sent_at<image_at-interval ''2 minutes''\n     or r.sent_at>image_at+interval ''20 minutes''\n     or n.posted_at>r.sent_at+interval ''15 minutes''\n     or r.sent_at<n.posted_at-interval ''15 minutes''\n  then return jsonb_build_object(''ok'',false,''status'',''time_mismatch''); end if;';
  new_times text:=E'  if abs(extract(epoch from(image_at-transaction_at)))>300\n     or transaction_at>now()+interval ''2 minutes''\n     or transaction_at<now()-interval ''36 hours''\n  then return jsonb_build_object(''ok'',false,''status'',''time_mismatch''); end if;';
  old_duplicate text:=E'         and o.posted_at between n.posted_at-interval ''5 minutes'' and n.posted_at+interval ''5 minutes'')';
  new_duplicate text:=E'         and public.chat_agribank_transfer_at(o.body) between transaction_at-interval ''5 minutes'' and transaction_at+interval ''5 minutes'')';
begin
  definition:=pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure);
  if definition is null or position(old_times in definition)=0
    or position(old_duplicate in definition)=0 then
    raise exception 'bank169_expected_writer_not_found';
  end if;
  definition:=replace(replace(definition,old_times,new_times),old_duplicate,new_duplicate);
  execute definition;
end
$patch$;
commit;