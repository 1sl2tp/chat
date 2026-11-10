-- BANK-282: only yesterday's fully reconciled Agribank transfers go to
-- the customers who actually transferred. Amount display unit: 1,000 VND.
-- One daily summary per customer; no unmatched bills, debts, or cash entries.

CREATE OR REPLACE FUNCTION v21_private.taphoa_bank_daily_transfer_rows(p_day date)
RETURNS TABLE(notification_id bigint,customer_account_id uuid,ledger_id bigint,
  amount_vnd bigint,transfer_at timestamptz,collection_method text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $bank$
 WITH mapped AS (
   SELECT l.notification_id,r.customer_account_id,l.ledger_id,
       'auto'::text AS kind,0 AS source_priority
   FROM public.chat_bank_app_collection_links l
   JOIN public.chat_bank_bill_receipts r ON r.id=l.receipt_id
   WHERE r.status='received' AND r.ledger_id=l.ledger_id
   UNION ALL
   SELECT m.notification_id,m.customer_account_id,m.ledger_id,
       'manual_bank'::text AS kind,1 AS source_priority
   FROM public.chat_bank_manual_collections m
   WHERE m.mode IN ('collected','linked_existing') AND m.ledger_id IS NOT NULL
 ), validated AS (
   SELECT DISTINCT ON(n.id)
     n.id notice_id,x.customer_account_id,x.ledger_id,n.amount_vnd,
     n.transfer_at,x.kind,x.source_priority
   FROM mapped x
   JOIN public.taphoa_agribank_notifications n ON n.id=x.notification_id
   JOIN public.taphoa_debt_ledger d ON d.id=x.ledger_id
     AND d.customer_account_id=x.customer_account_id AND d.entry_type='collection'
     AND d.amount_vnd IN (
       -trunc(n.amount_vnd::numeric/1000),
       -(n.amount_vnd::numeric/1000)
     )
   JOIN public.v21_accounts a ON a.id=x.customer_account_id
     AND a.role='user' AND a.contact_group='customer'
     AND a.deleted_at IS NULL AND a.locked_at IS NULL
   WHERE p_day IS NOT NULL
     AND (n.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=p_day
     AND n.status='credit_candidate'
     AND n.package_name='com.vnpay.Agribank3g'
     AND n.is_own_transfer IS FALSE
     AND n.bank_credit_account='2901181999999'
     AND n.amount_vnd>=1000 AND n.amount_vnd<1000000000000
     AND n.transfer_at IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM mapped other
       WHERE other.notification_id=n.id
         AND other.customer_account_id IS DISTINCT FROM x.customer_account_id
     )
   ORDER BY n.id,x.source_priority
 )
 SELECT notice_id,customer_account_id,ledger_id,amount_vnd,
        transfer_at,kind FROM validated;
$bank$;
REVOKE ALL ON FUNCTION v21_private.taphoa_bank_daily_transfer_rows(date)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_bank_daily_fmt_thousands(p_amount_vnd bigint)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $bank$
 SELECT replace(to_char(trunc(greatest(coalesce(p_amount_vnd,0),0)::numeric/1000),
     'FM999G999G999G999'),',','.');
$bank$;
REVOKE ALL ON FUNCTION v21_private.taphoa_bank_daily_fmt_thousands(bigint)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_bank_daily_client_id(p_day date,p_customer uuid)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $bank$
 SELECT 'taphoa:bank-daily:'||to_char(p_day,'YYYYMMDD')||':'||
        p_customer::text||':collection';
$bank$;
REVOKE ALL ON FUNCTION v21_private.taphoa_bank_daily_client_id(date,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_bank_daily_body(p_day date,p_customer uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $bank$
DECLARE v_count integer;v_total bigint;v_items text;v_remainder bigint;
  v_more integer;v_body text;
BEGIN
 WITH ranked AS (
  SELECT e.*,row_number() OVER(ORDER BY e.transfer_at,e.notification_id) seq
  FROM v21_private.taphoa_bank_daily_transfer_rows(p_day) e
  WHERE e.customer_account_id=p_customer
 )
 SELECT count(*)::integer,
        coalesce(sum(trunc(amount_vnd::numeric/1000)),0)::bigint,
        coalesce(sum(mod(amount_vnd,1000)),0)::bigint,
        coalesce(string_agg(CASE WHEN seq<=60 THEN
           to_char(transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh','HH24:MI')||
           ' · '||v21_private.taphoa_bank_daily_fmt_thousands(amount_vnd)
           ELSE NULL END,E'\n' ORDER BY transfer_at,notification_id),'')
 INTO v_count,v_total,v_remainder,v_items FROM ranked;
 IF v_count=0 THEN RETURN NULL; END IF;
 v_more=greatest(v_count-60,0);
 v_body:='TAPHOA · ĐỐI SOÁT CHUYỂN KHOẢN NGÀY '||
   to_char(p_day,'DD/MM/YYYY')||E'\n'||
   'Đơn vị: 1.000 đồng'||E'\n\n'||
   'Đã nhận và ghi thu '||v_count::text||' lượt chuyển khoản Agribank:'||
   E'\n'||v_items||
   CASE WHEN v_more>0 THEN E'\n… và '||v_more::text||' lượt khác' ELSE '' END||
   E'\n\nTỔNG ĐÃ NHẬN: '||
   v21_private.taphoa_bank_daily_fmt_thousands(v_total*1000)||
   CASE WHEN v_remainder>0 THEN
     E'\n(Phần lẻ dưới 1.000 đồng không hiển thị)' ELSE '' END||
   E'\n\nĐây là các khoản chuyển khoản đã đối soát cho tài khoản của anh/chị ngày hôm qua.'||
   E'\nNếu có chênh lệch, vui lòng phản hồi trực tiếp để cửa hàng kiểm tra. Cảm ơn anh/chị!';
 IF length(v_body)>8000 THEN RAISE EXCEPTION 'bank_daily_text_too_long'; END IF;
 RETURN v_body;
END;
$bank$;
REVOKE ALL ON FUNCTION v21_private.taphoa_bank_daily_body(date,uuid)
 FROM PUBLIC,anon,authenticated;

-- Single private source and sender shared by cron and the explicit admin button.
CREATE OR REPLACE FUNCTION v21_private.taphoa_bank_daily_send_one(
 p_day date,p_customer uuid,p_method text DEFAULT 'auto')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $bank$
DECLARE v_sender uuid;v_client text;v_body text;v_msg uuid;v_already uuid;
  v_time time:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
BEGIN
 IF p_day IS NULL OR p_customer IS NULL
    OR p_day<date '2026-10-19'
    OR p_day>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR p_day<(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-30
 THEN RETURN jsonb_build_object('ok',false,'status','date_out_of_range'); END IF;
 IF v_time<time '08:05' OR v_time>=time '20:00' THEN
   RETURN jsonb_build_object('ok',false,'status','quiet_hours');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bank-daily:'||p_day::text||':'||p_customer::text,0));
 SELECT a.id INTO v_sender FROM public.v21_accounts a
 WHERE a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL
 ORDER BY a.created_at,a.id LIMIT 1;
 IF v_sender IS NULL THEN RETURN jsonb_build_object('ok',false,'status','admin_sender_missing'); END IF;
 v_client:=v21_private.taphoa_bank_daily_client_id(p_day,p_customer);
 IF NOT EXISTS(SELECT 1 FROM v21_private.taphoa_bank_daily_transfer_rows(p_day) e
               WHERE e.customer_account_id=p_customer)
 THEN RETURN jsonb_build_object('ok',false,'status','no_verified_bank_transfer'); END IF;
 IF NOT v21_private.chat_outbound_allowed(p_customer,v_client) THEN
   RETURN jsonb_build_object('ok',false,'status','recipient_opted_out'); END IF;
 SELECT m.id INTO v_already FROM public.v21_messages m
 WHERE m.sender_account_id=v_sender AND m.client_id=v_client LIMIT 1;
 IF v_already IS NOT NULL THEN
   RETURN jsonb_build_object('ok',true,'status','already_sent','message_id',v_already);
 END IF;
 v_body:=v21_private.taphoa_bank_daily_body(p_day,p_customer);
 IF v_body IS NULL THEN RETURN jsonb_build_object('ok',false,'status','empty'); END IF;
 v_msg:=public.taphoa_chat_notify_customer(p_customer,v_sender,v_client,v_body);
 IF v_msg IS NULL THEN RETURN jsonb_build_object('ok',false,'status','send_not_allowed'); END IF;
 RETURN jsonb_build_object('ok',true,'status','sent','message_id',v_msg,
   'business_date',p_day::text,'method',p_method);
END;
$bank$;
REVOKE ALL ON FUNCTION v21_private.taphoa_bank_daily_send_one(date,uuid,text)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_bank_daily_dispatch()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $bank$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-1;
 v_time time:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;
 v_item record;v_result jsonb;v_sent int:=0;v_existing int:=0;
 v_skipped int:=0;v_errors int:=0;
BEGIN
 IF v_time<time '08:05' OR v_time>=time '20:00' THEN
   RETURN jsonb_build_object('ok',true,'status','quiet','sent',0);
 END IF;
 FOR v_item IN
   SELECT DISTINCT customer_account_id
   FROM v21_private.taphoa_bank_daily_transfer_rows(v_day)
   ORDER BY customer_account_id LIMIT 500
 LOOP
   BEGIN
     v_result:=v21_private.taphoa_bank_daily_send_one(
       v_day,v_item.customer_account_id,'scheduled');
     IF v_result->>'status'='sent' THEN v_sent:=v_sent+1;
     ELSIF v_result->>'status'='already_sent' THEN v_existing:=v_existing+1;
     ELSE v_skipped:=v_skipped+1; END IF;
   EXCEPTION WHEN OTHERS THEN
     -- Rollback only this customer's statement and continue. Never duplicate.
     v_errors:=v_errors+1;
   END;
 END LOOP;
 RETURN jsonb_build_object('ok',v_errors=0,'business_date',v_day::text,
   'sent',v_sent,'already_sent',v_existing,'skipped',v_skipped,'errors',v_errors);
END;
$bank$;
REVOKE ALL ON FUNCTION v21_private.taphoa_bank_daily_dispatch()
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.chat_bank_daily_transfer_preview(
 p_app_session_id uuid,p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $bank$
DECLARE v_admin uuid;v_result jsonb;v_today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
  AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_day IS NULL OR p_day<date '2026-10-19' OR p_day>=v_today OR p_day<v_today-30
 THEN RAISE EXCEPTION 'date_out_of_range'; END IF;
 WITH grouped AS (
   SELECT e.customer_account_id,count(*)::int transfer_count,
    sum(e.amount_vnd)::bigint amount_vnd,
    count(*) FILTER (WHERE e.collection_method='manual_bank')::int manual_bank_count
   FROM v21_private.taphoa_bank_daily_transfer_rows(p_day) e GROUP BY e.customer_account_id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'customer_id',g.customer_account_id::text,
  'customer_name',a.display_name,'transfer_count',g.transfer_count,
  'manual_bank_count',g.manual_bank_count,
  'amount_thousands',v21_private.taphoa_bank_daily_fmt_thousands(g.amount_vnd),
  'eligible',v21_private.chat_outbound_allowed(g.customer_account_id,
    v21_private.taphoa_bank_daily_client_id(p_day,g.customer_account_id)),
  'sent',EXISTS(SELECT 1 FROM public.v21_messages m
     WHERE m.sender_account_id=v_admin
       AND m.client_id=v21_private.taphoa_bank_daily_client_id(p_day,g.customer_account_id)),
  'body',v21_private.taphoa_bank_daily_body(p_day,g.customer_account_id)
 ) ORDER BY a.display_name),'[]'::jsonb)
 INTO v_result FROM grouped g JOIN public.v21_accounts a ON a.id=g.customer_account_id;
 RETURN jsonb_build_object('date',p_day::text,'unit','nghìn đồng','customers',v_result);
END;
$bank$;
REVOKE ALL ON FUNCTION public.chat_bank_daily_transfer_preview(uuid,date)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_bank_daily_transfer_preview(uuid,date)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_bank_daily_transfer_send_manual(
 p_app_session_id uuid,p_day date,p_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $bank$
DECLARE v_admin uuid;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
  AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_customer_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'status','customer_required');
 END IF;
 RETURN v21_private.taphoa_bank_daily_send_one(p_day,p_customer_id,'manual');
END;
$bank$;
REVOKE ALL ON FUNCTION public.chat_bank_daily_transfer_send_manual(uuid,date,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chat_bank_daily_transfer_send_manual(uuid,date,uuid)
 TO authenticated;

DO $cron$
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='taphoa-bank-prevday-confirmed-0805-vn') THEN
   RAISE EXCEPTION 'bank_daily_sender_already_scheduled';
 END IF;
 PERFORM cron.schedule('taphoa-bank-prevday-confirmed-0805-vn','5 1 * * *',
   'SELECT v21_private.taphoa_bank_daily_dispatch();');
END;
$cron$;