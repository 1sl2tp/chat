-- BANK-283: correct manual historical dates and sum of displayed thousands.
CREATE OR REPLACE FUNCTION v21_private.taphoa_bank_daily_body(p_day date, p_customer uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
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
   E'\n\nĐây là các khoản chuyển khoản đã đối soát cho tài khoản của anh/chị ngày '||to_char(p_day,'DD/MM/YYYY')||'.'||
   E'\nNếu có chênh lệch, vui lòng phản hồi trực tiếp để cửa hàng kiểm tra. Cảm ơn anh/chị!';
 IF length(v_body)>8000 THEN RAISE EXCEPTION 'bank_daily_text_too_long'; END IF;
 RETURN v_body;
END;
$function$;

CREATE OR REPLACE FUNCTION public.chat_bank_daily_transfer_preview(p_app_session_id uuid, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
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
    (sum(trunc(e.amount_vnd::numeric/1000))*1000)::bigint amount_vnd,
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
$function$;
