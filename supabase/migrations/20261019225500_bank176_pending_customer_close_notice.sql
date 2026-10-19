-- BANK-176: customer-visible close-of-day pending-bill notice, and readable VN currency formatting.
-- Uses existing opt-in protected taphoa_chat_notify_customer; no financial ledger writes.
CREATE OR REPLACE FUNCTION v21_private.chat_bank_report_close()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
DECLARE d date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-1; v_id uuid; v_admin uuid; rec record; v_body text;
BEGIN
 IF d<date '2026-10-19' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('chat_bank_report_close:'||d::text));
 INSERT INTO public.chat_bank_daily_reports(business_date,snapshot)
 VALUES(d,v21_private.chat_bank_report_snapshot(d)) ON CONFLICT(business_date) DO NOTHING;
 -- Each customer with an eligible, still-unmatched bill gets one daily message.
 -- Existing outbound opt-in and member-scoped canonical Chat RPC remain in charge.
 SELECT id INTO v_admin FROM public.v21_accounts
 WHERE role='admin' AND deleted_at IS NULL AND locked_at IS NULL ORDER BY created_at LIMIT 1;
 IF v_admin IS NOT NULL THEN
  FOR rec IN
    SELECT r.id,r.customer_account_id,r.amount_vnd,r.transfer_at_vn
    FROM public.chat_bank_bill_receipts r
    WHERE (r.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=d
      AND r.transfer_at_vn::date=d
      AND r.status IN ('amount_read','review')
      AND r.ledger_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links l WHERE l.receipt_id=r.id)
  LOOP
   BEGIN
    v_body:='🕛 Đối soát cuối ngày '||to_char(d,'DD/MM/YYYY')||': đã nhận bill '||
      coalesce(replace(to_char(rec.amount_vnd,'FM999,999,999,999,990'),',','.'),'chưa đọc rõ số tiền')||
      case when rec.amount_vnd IS NOT NULL THEN 'đ' ELSE '' END||
      ' (giao dịch '||to_char(rec.transfer_at_vn,'HH24:MI')||'). '||
      'Chưa có thông báo Agribank khớp duy nhất; CHƯA GHI THU. Hai bên tra soát lại khi có đủ chứng cứ.';
    PERFORM public.taphoa_chat_notify_customer(
      rec.customer_account_id,v_admin,'taphoa:bank:pending:'||rec.id::text,v_body);
   EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bank_daily_customer_notice_skipped %',SQLSTATE;
   END;
  END LOOP;
 END IF;
 v_id:=v21_private.chat_bank_report_send(d,'close','close',NULL);
 RETURN v_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION v21_private.chat_bank_report_send(p_day date, p_event_key text, p_kind text DEFAULT 'update'::text, p_notice_id bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
DECLARE
 d jsonb; v_system uuid; v_admin uuid; v_conversation uuid; v_message uuid;
 line jsonb; txt text; title text; v_amount bigint; v_time text; v_customer text;
BEGIN
 IF p_day<date '2026-10-19' OR p_event_key IS NULL OR length(p_event_key)>50 THEN RETURN NULL; END IF;
 SELECT id INTO v_system FROM public.v21_accounts
 WHERE username='taphoa_bao_cao' AND auth_user_id IS NULL AND role='user' AND deleted_at IS NULL LIMIT 1;
 SELECT id INTO v_admin FROM public.v21_accounts
 WHERE role='admin' AND deleted_at IS NULL AND locked_at IS NULL ORDER BY created_at LIMIT 1;
 IF v_system IS NULL OR v_admin IS NULL THEN RETURN NULL; END IF;
 SELECT id INTO v_conversation FROM public.v21_conversations
 WHERE member_a=least(v_admin,v_system) AND member_b=greatest(v_admin,v_system) LIMIT 1;
 IF v_conversation IS NULL THEN RETURN NULL; END IF;
 IF p_kind='close' THEN
   SELECT snapshot INTO d FROM public.chat_bank_daily_reports WHERE business_date=p_day;
 END IF;
 IF d IS NULL THEN d:=v21_private.chat_bank_report_snapshot(p_day); END IF;
 title:=CASE p_kind WHEN 'close' THEN '🔒 CHỐT SỔ NGÀY'
  WHEN 'matched' THEN '✅ VỪA ĐỐI SOÁT KHỚP'
  WHEN 'bank_only' THEN '🔔 AGRIBANK CÓ TIỀN — ĐANG CHỜ BILL'
  ELSE '📊 BÁO CÁO ĐỐI SOÁT' END;
 txt:=title||' '||to_char(p_day,'DD/MM/YYYY')||E'\n';
 IF p_kind='bank_only' AND p_notice_id IS NOT NULL THEN
   SELECT n.amount_vnd,to_char(n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh','HH24:MI')
   INTO v_amount,v_time FROM public.taphoa_agribank_notifications n WHERE id=p_notice_id;
   txt:=txt||'Thông báo #'||p_notice_id::text||': '||coalesce(v_amount::text,'?')||'đ lúc '||coalesce(v_time,'?')||'. Chưa gán cho khách khi chưa có bill.'||E'\n';
 ELSIF p_kind='matched' AND p_notice_id IS NOT NULL THEN
   SELECT r.amount_vnd,to_char(r.transfer_at_vn,'HH24:MI'),a.display_name
   INTO v_amount,v_time,v_customer
   FROM public.chat_bank_app_collection_links l
   JOIN public.chat_bank_bill_receipts r ON r.id=l.receipt_id
   JOIN public.v21_accounts a ON a.id=r.customer_account_id
   WHERE l.notification_id=p_notice_id LIMIT 1;
   txt:=txt||coalesce(v_customer,'Khách')||': '||coalesce(v_amount::text,'?')||'đ lúc '||coalesce(v_time,'?')||'.'||E'\n';
 END IF;
 txt:=txt||'Đã khớp: '||(d->>'matched_count')||' giao dịch · '||replace(to_char((d->>'matched_amount')::numeric,'FM999,999,999,999,990'),',','.')||'đ'||E'\n';
 FOR line IN SELECT value FROM jsonb_array_elements(coalesce(d->'matched_customers','[]'::jsonb)) LOOP
   txt:=txt||'• '||(line->>'customer')||': '||(line->>'count')||' bill · '||replace(to_char((line->>'amount')::numeric,'FM999,999,999,999,990'),',','.')||'đ · trùng '||(line->>'duplicates')||' · sai ngày '||(line->>'wrong_date')||E'\n';
 END LOOP;
 txt:=txt||'Agribank ngoại lai: '||(d->>'bank_count')||' giao dịch · '||replace(to_char((d->>'bank_amount')::numeric,'FM999,999,999,999,990'),',','.')||'đ'||E'\n'
   ||'Chưa có bill: '||(d->>'bank_only_count')||' · '||replace(to_char((d->>'bank_only_amount')::numeric,'FM999,999,999,999,990'),',','.')||'đ'||E'\n'
   ||'Bill chưa khớp: '||(d->>'bill_only_count')||E'\n'
   ||'Bill sai ngày: '||(d->>'old_date_count')||' · thiếu/không rõ ngày: '||(d->>'unreadable_date_count')||E'\n'
   ||'Ảnh bill trùng: '||(d->>'duplicate_count')||' · ảnh không phải bill: '||(d->>'non_bill_count')||E'\n'
   ||'Chuyển tiền chủ tài khoản (loại): '||(d->>'own_transfer_notice_count')||' thông báo; '
   ||'đã từng ghi thử: '||(d->>'historical_test_link_count')||' khoản · '||replace(to_char((d->>'historical_test_link_amount')::numeric,'FM999,999,999,999,990'),',','.')||'đ (KHÔNG cộng vào tiền khách).';
 IF jsonb_array_length(coalesce(d->'problem_customers','[]'::jsonb))>0 THEN
 txt:=txt||E'\nNgoại lệ theo khách:';
 FOR line IN SELECT value FROM jsonb_array_elements(d->'problem_customers') LOOP
  txt:=txt||E'\n• '||(line->>'customer')||': trùng '||(line->>'duplicates')||', sai ngày '||(line->>'wrong_date');
 END LOOP;
 END IF;
 IF (d->>'bank_only_count')::int>0 THEN
   txt:=txt||E'\nAgribank chưa có bill:';
   FOR line IN SELECT value FROM jsonb_array_elements(d->'bank_only_details') LOOP
     txt:=txt||E'\n• #'||(line->>'id')||' '||(line->>'amount')||'đ · '||(line->>'time');
   END LOOP;
 END IF;
 IF (d->>'bill_only_count')::int>0 THEN
   txt:=txt||E'\nBill đang chờ:';
   FOR line IN SELECT value FROM jsonb_array_elements(d->'bill_only_details') LOOP
     txt:=txt||E'\n• '||(line->>'customer')||' '||coalesce(line->>'amount','?')||'đ · '||(line->>'time');
   END LOOP;
 END IF;
 IF p_kind='close' THEN txt:=txt||E'\nHết ngày: khóa số liệu báo cáo; chứng cứ muộn được tra soát bổ sung, không tự nhập thu hồi tố.'; END IF;
 txt:=left(txt,7900);
 INSERT INTO public.v21_messages(conversation_id,sender_account_id,client_id,body)
 VALUES(v_conversation,v_system,'taphoa:bank-report:'||p_day::text||':'||p_event_key,txt)
 ON CONFLICT ON CONSTRAINT v21_messages_sender_account_id_client_id_key DO NOTHING
 RETURNING id INTO v_message;
 IF v_message IS NULL THEN
   SELECT id INTO v_message FROM public.v21_messages
   WHERE sender_account_id=v_system AND client_id='taphoa:bank-report:'||p_day::text||':'||p_event_key;
 END IF;
 RETURN v_message;
END;
$function$
;
