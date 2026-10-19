-- BANK-169: final posting gate uses bank+bill TRANSACTION time only.
-- Neither Android push delay nor Chat upload delay is evidence of matching.
begin;
do $patch$
declare def text; from_text text; to_text text;
begin
 def:=pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure);
 from_text:=E'  if abs(extract(epoch from(n.posted_at-transaction_at)))>900\n     or abs(extract(epoch from(image_at-transaction_at)))>300\n     or r.sent_at<image_at-interval ''2 minutes''\n     or r.sent_at>image_at+interval ''20 minutes''\n     or n.posted_at>r.sent_at+interval ''15 minutes''\n     or r.sent_at<n.posted_at-interval ''15 minutes''\n  then return jsonb_build_object(''ok'',false,''status'',''time_mismatch''); end if;';
 to_text:=E'  if abs(extract(epoch from(image_at-transaction_at)))>300\n     or transaction_at>now()+interval ''2 minutes''\n  then return jsonb_build_object(''ok'',false,''status'',''time_mismatch''); end if;';
 if position(from_text in def)=0 then raise exception 'bank169_poster_time_guard_changed'; end if;
 def:=replace(def,from_text,to_text);

 from_text:='or r.sent_at<now()-interval ''36 hours'' or r.scanned_at<now()-interval ''36 hours''';
 if position(from_text in def)=0 then raise exception 'bank169_receipt_upload_limit_changed'; end if;
 def:=replace(def,from_text,'');

 from_text:='or n.amount_vnd is null or n.amount_vnd<=0 or n.created_at<now()-interval ''36 hours''';
 to_text:='or n.amount_vnd is null or n.amount_vnd<=0 or n.is_own_transfer=true or n.transfer_at is null';
 if position(from_text in def)=0 then raise exception 'bank169_bank_delivery_limit_changed'; end if;
 def:=replace(def,from_text,to_text);

 from_text:='and o.posted_at between n.posted_at-interval ''5 minutes'' and n.posted_at+interval ''5 minutes''';
 to_text:='and o.transfer_at between n.transfer_at-interval ''5 minutes'' and n.transfer_at+interval ''5 minutes''';
 if position(from_text in def)=0 then raise exception 'bank169_duplicate_time_guard_changed'; end if;
 def:=replace(def,from_text,to_text);
 execute def;
end
$patch$;
commit;