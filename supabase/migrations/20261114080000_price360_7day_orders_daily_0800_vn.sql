-- PRICE-360 · 2026-11-14. Canonical Chat: change the separate group-price
-- advisory from 06:00, delta-only, to 08:00 Viet Nam DAILY 7-day order inventory.
-- "Sold" orders are status=delivered; reversed/older/unsold catalogue rows excluded.
-- No real messages in tests; this versioned migration alone activates the new schedule.
-- Preserve per-day idempotency, one-part-at-a-time Zalo ACK and prior-part gates.
CREATE OR REPLACE FUNCTION v21_private.taphoa_price7d_text(p_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $function$
DECLARE
  v_lines text;
  v_body text;
BEGIN
  WITH bounds AS (
    SELECT p_at - interval '7 days' AS starts_at, p_at AS ends_at
  ),
  history AS (
    SELECT h.product_code, h.old_sale,
           row_number() OVER (PARTITION BY h.product_code ORDER BY h.changed_at, h.id) AS first_row
    FROM public.taphoa_product_price_history h, bounds w
    WHERE h.changed_at >= w.starts_at AND h.changed_at <= w.ends_at
  ),
  first_price AS (
    SELECT product_code, max(old_sale) FILTER (WHERE first_row=1) AS old_sale
    FROM history GROUP BY product_code
  ),
  selected_products AS (
    -- "Đã bán" is represented by delivered orders in TAPHOA.
    -- Include an order created or delivered in the rolling 7-day window.
    SELECT DISTINCT i.product_code
    FROM public.taphoa_orders o
    JOIN public.taphoa_order_items i ON i.order_id=o.id, bounds w
    WHERE (o.status='pending' AND o.created_at BETWEEN w.starts_at AND w.ends_at)
       OR (o.status='delivered' AND (
             o.delivered_at BETWEEN w.starts_at AND w.ends_at
             OR o.created_at BETWEEN w.starts_at AND w.ends_at))
  ),
  eligible AS (
    SELECT
      btrim(regexp_replace(extensions.unaccent(replace(p.product_name,'*','')),
                    '[[:space:]]+',' ','g')) AS product_name,
      p.sale_price_vnd AS price_now,
      CASE WHEN h.old_sale > 0
        AND abs(p.sale_price_vnd-h.old_sale)/h.old_sale <= 0.30
        THEN h.old_sale ELSE NULL END AS price_old
    FROM selected_products s
    JOIN public.taphoa_products p ON p.product_code=s.product_code
    LEFT JOIN first_price h ON h.product_code=p.product_code
    WHERE p.is_active=true AND p.deleted_at IS NULL
      AND p.input_price_vnd > 0 AND p.sale_price_vnd > 0
      AND p.source_key <> 'thuoc-la'
      AND lower(extensions.unaccent(p.product_name)) !~ '^(bia|ruou|thuoc la|thuoc|cigar|vape|pod|nicotine)( |$)'
      AND nullif(btrim(p.product_name),'') IS NOT NULL
  ),
  merged AS (
    SELECT product_name, price_now,
           CASE WHEN count(*)=count(price_old)
                 AND count(DISTINCT price_old)=1
             THEN min(price_old) ELSE NULL END AS price_old
    FROM eligible
    GROUP BY product_name,price_now
  ),
  priced AS (
    SELECT product_name,
           '- '||product_name||' - '||
           CASE WHEN price_old IS NOT NULL AND price_old<>price_now
             THEN price_old::text||' -> '||price_now::text||
               ' ('||CASE WHEN price_now>price_old THEN '+' ELSE '' END||
               (price_now-price_old)::text||')'
             ELSE price_now::text END AS product_line
    FROM merged
  )
  SELECT string_agg(product_line,E'\n' ORDER BY lower(product_name), product_name, product_line)
  INTO v_lines
  FROM priced;

  IF nullif(v_lines,'') IS NULL THEN
    RETURN NULL; -- no eligible orders in the last 7 days: do not send an empty group post
  END IF;
  v_body :=
    'CẬP NHẬT GIÁ & HÀNG BÁN 7 NGÀY - '||
    to_char(p_at AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY')||E'\n\n'||
    'Em chào anh/chị ạ!'||E'\n'||
    'Em gửi các mặt hàng đã xuất hiện trong đơn tạm, đơn đã giao hoặc đã bán trong 7 ngày gần nhất để anh/chị tham khảo và bổ sung theo nhu cầu.'||E'\n'||
    'Giá thay đổi được ghi theo dạng giá cũ -> giá mới (+/- mức chênh). Với giá thay đổi bất thường hoặc chưa có mốc so sánh tin cậy, em chỉ ghi giá hiện tại.'||E'\n\n'||
    v_lines||E'\n\n'||
    'Anh/chị đã từng được bên em xác nhận giá hỗ trợ riêng vui lòng nhắn riêng để em đối chiếu và giữ đúng mức hỗ trợ phù hợp; giá riêng không đăng trong nhóm.'||E'\n'||
    'Tình trạng hàng, quy cách và lịch giao sẽ được kiểm tra khi chốt đơn. Anh/chị cần bổ sung mặt hàng nào cứ gửi em tên và số lượng ạ.'||E'\n'||
    'Bảng giá tham khảo: https://app.taphoa.xyz/bao-gia/'||E'\n'||
    'Em cảm ơn anh/chị!';
  IF char_length(v_body) > 25000 THEN
    RAISE EXCEPTION 'price7d_body_excess:%',char_length(v_body);
  END IF;
  RETURN v_body;
END;
$function$;


CREATE OR REPLACE FUNCTION v21_private.taphoa_price7d_send_ordered(p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $function$
DECLARE
  v_local timestamp := p_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_day date := (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_campaign text := 'advisory:price7d:group:'||to_char(p_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYYMMDD');
  v_sender uuid;
  v_receiver uuid;
  v_zalo text;
  v_conversation uuid;
  v_batch v21_private.taphoa_price7d_batches%ROWTYPE;
  v_full text;
  v_lines text[];
  v_parts text[] := ARRAY[]::text[];
  v_current text := '';
  v_line text;
  v_i integer;
  v_n integer;
  v_message uuid;
  v_client text;
  v_state text;
  v_zalo_message text;
  v_prefix text;
  v_catalogue jsonb;
  v_base v21_private.taphoa_price7d_delivery_state%ROWTYPE;
  v_prior v21_private.taphoa_price7d_batches%ROWTYPE;
  v_count integer;
  v_missing integer;
BEGIN
  IF v_local::time < time '08:00' OR v_local::time >= time '08:45' THEN
    RETURN jsonb_build_object('ok',true,'status','outside_window');
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('price7d:'||v_day::text,0)) THEN
    RETURN jsonb_build_object('ok',true,'status','busy');
  END IF;
  SELECT l.linked_by_account_id,l.chat_account_id,z.zalo_id
    INTO v_sender,v_receiver,v_zalo
  FROM public.zalo_contacts z
  JOIN public.zalo_user_links l ON l.zalo_id=z.zalo_id
  JOIN public.v21_accounts a ON a.id=l.linked_by_account_id
  JOIN public.v21_accounts t ON t.id=l.chat_account_id
  WHERE z.display_name='Báo Giá - 0911479555'
    AND z.thread_type='group'
    AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL
    AND t.role='user' AND t.deleted_at IS NULL AND t.locked_at IS NULL
  ORDER BY l.linked_at DESC LIMIT 1;
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('ok',false,'status','destination_not_verified');
  END IF;
  SELECT c.id INTO v_conversation
  FROM public.v21_conversations c
  WHERE (c.member_a=v_sender AND c.member_b=v_receiver)
     OR (c.member_b=v_sender AND c.member_a=v_receiver)
  ORDER BY c.created_at DESC LIMIT 1;
  IF v_conversation IS NULL THEN
    RETURN jsonb_build_object('ok',false,'status','conversation_missing');
  END IF;

  SELECT * INTO v_batch FROM v21_private.taphoa_price7d_batches
  WHERE business_date=v_day FOR UPDATE;
  IF NOT FOUND THEN
    -- PRICE-360: previous no-change skip records are not authoritative
    -- for this daily order-based report.
    SELECT * INTO v_base FROM v21_private.taphoa_price7d_delivery_state
      WHERE singleton=true FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status','baseline_missing'); END IF;
    -- Advance snapshot only when all earlier queued parts were ACKed by Zalo.
    FOR v_prior IN SELECT * FROM v21_private.taphoa_price7d_batches
       WHERE catalogue_snapshot IS NOT NULL
         AND created_at>v_base.last_success_at AND business_date<v_day
       ORDER BY created_at
    LOOP
      v_missing:=null;
      SELECT g.part INTO v_missing
      FROM generate_series(1,cardinality(v_prior.parts)) AS g(part)
      WHERE NOT EXISTS(
        SELECT 1 FROM public.v21_messages m JOIN public.zalo_message_links z
          ON z.chat_message_id=m.id
        WHERE m.sender_account_id=v_prior.sender_id
          AND m.client_id='advisory:price7d:group:'||
              to_char(v_prior.business_date,'YYYYMMDD')||':part:'||lpad(g.part::text,2,'0')
          AND m.deleted_at IS NULL AND z.zalo_id=v_prior.zalo_id
          AND z.direction='outbound' AND z.state='sent'
          AND nullif(z.zalo_message_id,'') IS NOT NULL
      ) ORDER BY g.part LIMIT 1;
      IF v_missing IS NOT NULL THEN
        RETURN jsonb_build_object('ok',false,'status','prior_delivery_pending',
          'business_date',v_prior.business_date::text,'pending_part',v_missing);
      END IF;
      UPDATE v21_private.taphoa_price7d_delivery_state
        SET catalogue_snapshot=v_prior.catalogue_snapshot,
            last_success_date=v_prior.business_date,last_success_at=p_at
        WHERE singleton=true;
      SELECT * INTO v_base FROM v21_private.taphoa_price7d_delivery_state WHERE singleton=true;
    END LOOP;
    v_full:=v21_private.taphoa_price7d_text(p_at);
    IF nullif(v_full,'') IS NULL THEN
      RETURN jsonb_build_object('ok',true,'status','no_recent_orders','business_date',v_day::text);
    END IF;
    -- Retain snapshot bookkeeping for release/rollback compatibility only.
    -- Do not gate the send on catalogue changes: every day has a fresh 7-day window.
    v_catalogue:=v21_private.taphoa_price7d_catalogue_snapshot();
    WITH bounds AS (
      SELECT p_at-interval '7 days' AS starts_at,p_at AS ends_at
    ), selected AS (
      SELECT DISTINCT i.product_code
      FROM public.taphoa_orders o
      JOIN public.taphoa_order_items i ON i.order_id=o.id, bounds w
      WHERE (o.status='pending' AND o.created_at BETWEEN w.starts_at AND w.ends_at)
         OR (o.status='delivered' AND (
               o.delivered_at BETWEEN w.starts_at AND w.ends_at
               OR o.created_at BETWEEN w.starts_at AND w.ends_at))
    )
    SELECT count(*) INTO v_count FROM selected s JOIN public.taphoa_products p
      ON p.product_code=s.product_code
    WHERE p.is_active=true AND p.deleted_at IS NULL
      AND p.input_price_vnd>0 AND p.sale_price_vnd>0
      AND p.source_key<>'thuoc-la'
      AND lower(extensions.unaccent(p.product_name))
        !~ '^(bia|ruou|thuoc la|thuoc|cigar|vape|pod|nicotine)( |$)'
      AND nullif(btrim(p.product_name),'') IS NOT NULL;
    v_lines := string_to_array(v_full,E'\n');
    FOREACH v_line IN ARRAY v_lines LOOP
      IF char_length(v_line)>1250 THEN
        RAISE EXCEPTION 'price7d_line_excess';
      END IF;
      IF v_current='' THEN
        v_current:=v_line;
      ELSIF char_length(v_current)+1+char_length(v_line)>1250 THEN
        v_parts:=array_append(v_parts,v_current);
        v_current:=v_line;
      ELSE
        v_current:=v_current||E'\n'||v_line;
      END IF;
    END LOOP;
    v_parts:=array_append(v_parts,v_current);
    v_n:=cardinality(v_parts);
    IF v_n NOT BETWEEN 1 AND 20 OR array_to_string(v_parts,E'\n')<>v_full THEN
      RAISE EXCEPTION 'price7d_split_integrity_failed:%',v_n;
    END IF;
    INSERT INTO v21_private.taphoa_price7d_batches
      (business_date,sender_id,receiver_id,zalo_id,body,parts,catalogue_snapshot,changed_products)
    VALUES (v_day,v_sender,v_receiver,v_zalo,v_full,v_parts,v_catalogue,v_count)
    RETURNING * INTO v_batch;
  ELSIF v_batch.sender_id<>v_sender OR v_batch.receiver_id<>v_receiver
        OR v_batch.zalo_id<>v_zalo THEN
    RETURN jsonb_build_object('ok',false,'status','linked_destination_changed');
  END IF;

  v_n:=cardinality(v_batch.parts);
  FOR v_i IN 1..v_n LOOP
    v_client:=v_campaign||':part:'||lpad(v_i::text,2,'0');
    v_message:=NULL;
    SELECT m.id INTO v_message
    FROM public.v21_messages m
    WHERE m.sender_account_id=v_sender AND m.client_id=v_client
      AND m.conversation_id=v_conversation AND m.deleted_at IS NULL LIMIT 1;
    IF v_message IS NOT NULL THEN
      SELECT z.state,z.zalo_message_id INTO v_state,v_zalo_message
      FROM public.zalo_message_links z
      WHERE z.chat_message_id=v_message AND z.direction='outbound'
        AND z.zalo_id=v_zalo
      ORDER BY z.created_at DESC LIMIT 1;
      IF v_state='sent' AND nullif(v_zalo_message,'') IS NOT NULL THEN
        CONTINUE;
      END IF;
      RETURN jsonb_build_object('ok',false,'status',coalesce(v_state,'outbox_missing'),
        'part',v_i,'parts',v_n,'message_id',v_message);
    END IF;
    v_prefix:='[BẢNG HÀNG 7 NGÀY - PHẦN '||v_i||'/'||v_n||']';
    IF char_length(v_prefix)+1+char_length(v_batch.parts[v_i])>1350 THEN
      RAISE EXCEPTION 'price7d_part_excess:%',v_i;
    END IF;
    INSERT INTO public.v21_messages(conversation_id,sender_account_id,client_id,body)
    VALUES(v_conversation,v_sender,v_client,v_prefix||E'\n'||v_batch.parts[v_i])
    ON CONFLICT ON CONSTRAINT v21_messages_sender_account_id_client_id_key
    DO NOTHING RETURNING id INTO v_message;
    IF v_message IS NULL THEN
      RETURN jsonb_build_object('ok',false,'status','concurrent_message_conflict');
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.zalo_message_links z
      WHERE z.chat_message_id=v_message AND z.direction='outbound'
        AND z.zalo_id=v_zalo
    ) THEN
      RAISE EXCEPTION 'price7d_outbox_missing:%',v_i;
    END IF;
    RETURN jsonb_build_object('ok',true,'status','queued',
      'recipient','Báo Giá - 0911479555','part',v_i,'parts',v_n,
      'message_id',v_message);
  END LOOP;
  IF v_batch.catalogue_snapshot IS NOT NULL THEN
    UPDATE v21_private.taphoa_price7d_delivery_state
      SET catalogue_snapshot=v_batch.catalogue_snapshot,
          last_success_date=v_day,last_success_at=p_at
      WHERE singleton=true AND last_success_at<v_batch.created_at;
  END IF;
  RETURN jsonb_build_object('ok',true,'status','sent',
    'recipient','Báo Giá - 0911479555','parts',v_n,
    'included_products',v_batch.changed_products,'business_date',v_day::text);
END;
$function$;
REVOKE ALL ON FUNCTION v21_private.taphoa_price7d_send_ordered(timestamptz) FROM PUBLIC,anon,authenticated;
-- The old job is retired atomically with the new morning schedule.
DO $price360$
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='taphoa-price7d-advisory-0600-vn') THEN
    PERFORM cron.unschedule('taphoa-price7d-advisory-0600-vn');
  END IF;
END;
$price360$;
-- 01:00 UTC is 08:00 Viet Nam. 08:00-08:44 allows ordered multipart ACKs.
SELECT cron.schedule(
  'taphoa-price7d-advisory-0800-vn',
  '0-44 1 * * *',
  $$SELECT v21_private.taphoa_price7d_send_ordered(now());$$
);
