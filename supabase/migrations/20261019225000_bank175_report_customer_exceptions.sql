-- BANK-175: show per-customer duplicate and wrong-day counts in admin report.
CREATE OR REPLACE FUNCTION v21_private.chat_bank_report_snapshot(p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
WITH bank AS (
 SELECT n.* FROM public.taphoa_agribank_notifications n
 WHERE n.status='credit_candidate' AND n.package_name='com.vnpay.Agribank3g'
 AND n.bank_credit_account='2901181999999'
 AND n.is_own_transfer IS FALSE
 AND (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day
), matched AS (
 SELECT l.notification_id,l.receipt_id,r.customer_account_id,r.amount_vnd,
        a.display_name,r.transfer_at_vn
 FROM public.chat_bank_app_collection_links l
 JOIN bank n ON n.id=l.notification_id
 JOIN public.chat_bank_bill_receipts r ON r.id=l.receipt_id
 JOIN public.v21_accounts a ON a.id=r.customer_account_id
 WHERE r.amount_vnd=n.amount_vnd
   AND r.transfer_at_vn::date=p_day
   AND (r.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day
   AND abs(extract(epoch FROM ((n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')-r.transfer_at_vn)))<=300
), customers AS (
 SELECT m.customer_account_id,m.display_name,count(*)::int AS bills,sum(m.amount_vnd)::bigint AS amount_vnd,
 (SELECT count(*) FROM public.chat_bank_bill_receipts r WHERE r.customer_account_id=m.customer_account_id AND (r.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day AND r.status='duplicate')::int AS duplicate_count,
 (SELECT count(*) FROM public.chat_bank_bill_receipts r WHERE r.customer_account_id=m.customer_account_id AND (r.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day AND r.transfer_at_vn IS NOT NULL AND r.transfer_at_vn::date<>p_day)::int AS old_date_count
 FROM matched m GROUP BY m.customer_account_id,m.display_name
), bill_today AS (
 SELECT * FROM public.chat_bank_bill_receipts r
 WHERE (r.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day
), bank_pending AS (
 SELECT n.id,n.amount_vnd,n.transfer_at FROM bank n
 WHERE NOT EXISTS (SELECT 1 FROM public.chat_bank_app_collection_links l WHERE l.notification_id=n.id)
)
SELECT jsonb_build_object(
 'date',p_day,
 'bank_count',(SELECT count(*) FROM bank),
 'bank_amount',(SELECT coalesce(sum(amount_vnd),0) FROM bank),
 'matched_count',(SELECT count(*) FROM matched),
 'matched_amount',(SELECT coalesce(sum(amount_vnd),0) FROM matched),
 'matched_customers',coalesce((SELECT jsonb_agg(jsonb_build_object('customer',display_name,'count',bills,'amount',amount_vnd,'duplicates',duplicate_count,'wrong_date',old_date_count) ORDER BY lower(display_name)) FROM customers),'[]'::jsonb),
 'problem_customers',coalesce((SELECT jsonb_agg(jsonb_build_object('customer',display_name,'duplicates',duplicate_count,'wrong_date',old_date_count) ORDER BY lower(display_name))
 FROM (
 SELECT a.display_name,
 count(*) FILTER(WHERE r.status='duplicate')::int AS duplicate_count,
 count(*) FILTER(WHERE r.transfer_at_vn IS NOT NULL AND r.transfer_at_vn::date<>p_day)::int AS old_date_count
 FROM bill_today r JOIN public.v21_accounts a ON a.id=r.customer_account_id
 GROUP BY r.customer_account_id,a.display_name
 ) issues WHERE duplicate_count>0 OR old_date_count>0),'[]'::jsonb),
 'bank_only_count',(SELECT count(*) FROM bank_pending),
 'bank_only_amount',(SELECT coalesce(sum(amount_vnd),0) FROM bank_pending),
 'bank_only_details',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'amount',amount_vnd,'time',to_char(transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh','HH24:MI')) ORDER BY transfer_at) FROM (SELECT * FROM bank_pending ORDER BY transfer_at LIMIT 15) bp),'[]'::jsonb),
 'bill_only_count',(SELECT count(*) FROM bill_today r WHERE r.status IN ('amount_read','review','queued','scanning') AND r.transfer_at_vn::date=p_day AND NOT EXISTS (SELECT 1 FROM public.chat_bank_app_collection_links l WHERE l.receipt_id=r.id)),
 'bill_only_details',coalesce((SELECT jsonb_agg(jsonb_build_object('customer',coalesce(a.display_name,'?'),'amount',r.amount_vnd,'time',to_char(r.transfer_at_vn,'HH24:MI')) ORDER BY r.sent_at) FROM (SELECT * FROM bill_today r WHERE r.status IN ('amount_read','review','queued','scanning') AND r.transfer_at_vn::date=p_day AND NOT EXISTS (SELECT 1 FROM public.chat_bank_app_collection_links l WHERE l.receipt_id=r.id) ORDER BY r.sent_at LIMIT 15) r LEFT JOIN public.v21_accounts a ON a.id=r.customer_account_id),'[]'::jsonb),
 'old_date_count',(SELECT count(*) FROM bill_today WHERE transfer_at_vn IS NOT NULL AND transfer_at_vn::date<>p_day),
 'unreadable_date_count',(SELECT count(*) FROM bill_today WHERE transfer_at_vn IS NULL AND status IN ('amount_read','review','queued','scanning')),
 'duplicate_count',(SELECT count(*) FROM bill_today WHERE status='duplicate'),
 'non_bill_count',(SELECT count(*) FROM bill_today WHERE status='non_bill'),
 'received_images_count',(SELECT count(*) FROM bill_today),
 'own_transfer_notice_count',(SELECT count(*) FROM public.taphoa_agribank_notifications n WHERE n.is_own_transfer IS TRUE AND (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day),
 'historical_test_link_count',(SELECT count(*) FROM public.chat_bank_app_collection_links l JOIN public.taphoa_agribank_notifications n ON n.id=l.notification_id WHERE n.is_own_transfer IS TRUE AND (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day),
 'historical_test_link_amount',(SELECT coalesce(sum(n.amount_vnd),0) FROM public.chat_bank_app_collection_links l JOIN public.taphoa_agribank_notifications n ON n.id=l.notification_id WHERE n.is_own_transfer IS TRUE AND (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day)
);
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
 txt:=txt||'Đã khớp: '||(d->>'matched_count')||' giao dịch · '||(d->>'matched_amount')||'đ'||E'\n';
 FOR line IN SELECT value FROM jsonb_array_elements(coalesce(d->'matched_customers','[]'::jsonb)) LOOP
   txt:=txt||'• '||(line->>'customer')||': '||(line->>'count')||' bill · '||(line->>'amount')||'đ · trùng '||(line->>'duplicates')||' · sai ngày '||(line->>'wrong_date')||E'\n';
 END LOOP;
 txt:=txt||'Agribank ngoại lai: '||(d->>'bank_count')||' giao dịch · '||(d->>'bank_amount')||'đ'||E'\n'
   ||'Chưa có bill: '||(d->>'bank_only_count')||' · '||(d->>'bank_only_amount')||'đ'||E'\n'
   ||'Bill chưa khớp: '||(d->>'bill_only_count')||E'\n'
   ||'Bill sai ngày: '||(d->>'old_date_count')||' · thiếu/không rõ ngày: '||(d->>'unreadable_date_count')||E'\n'
   ||'Ảnh bill trùng: '||(d->>'duplicate_count')||' · ảnh không phải bill: '||(d->>'non_bill_count')||E'\n'
   ||'Chuyển tiền chủ tài khoản (loại): '||(d->>'own_transfer_notice_count')||' thông báo; '
   ||'đã từng ghi thử: '||(d->>'historical_test_link_count')||' khoản · '||(d->>'historical_test_link_amount')||'đ (KHÔNG cộng vào tiền khách).';
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
