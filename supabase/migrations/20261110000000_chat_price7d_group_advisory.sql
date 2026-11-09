-- PRICE-271: New app-owned 06:00 VN group quote, independent of the retired
-- 06:00 milk and 09:00 general advisory jobs (both remain inactive).
-- Deployment is via reviewed Supabase migration; never use this file as a
-- manual message sender. Zalo outbound is owned by existing Chat triggers.
CREATE TABLE IF NOT EXISTS v21_private.taphoa_price7d_batches (
  business_date date PRIMARY KEY,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  zalo_id text NOT NULL,
  body text NOT NULL,
  parts text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION v21_private.taphoa_price7d_text(p_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $function$
DECLARE
  v_lines text;
  v_body text;
BEGIN
  WITH window AS (
    SELECT p_at - interval '7 days' AS starts_at, p_at AS ends_at
  ),
  history AS (
    SELECT h.product_code, h.old_sale,
           row_number() OVER (PARTITION BY h.product_code ORDER BY h.changed_at, h.id) AS first_row
    FROM public.taphoa_product_price_history h, window w
    WHERE h.changed_at >= w.starts_at AND h.changed_at <= w.ends_at
  ),
  first_price AS (
    SELECT product_code, max(old_sale) FILTER (WHERE first_row=1) AS old_sale
    FROM history GROUP BY product_code
  ),
  selected_products AS (
    SELECT product_code FROM history
    UNION
    SELECT i.product_code FROM public.taphoa_orders o
      JOIN public.taphoa_order_items i ON i.order_id=o.id, window w
    WHERE o.status='delivered'
      AND o.delivered_at >= w.starts_at AND o.delivered_at <= w.ends_at
    UNION
    SELECT i.product_code FROM public.taphoa_orders o
      JOIN public.taphoa_order_items i ON i.order_id=o.id, window w
    WHERE o.status='pending'
      AND o.created_at >= w.starts_at AND o.created_at <= w.ends_at
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
    RAISE EXCEPTION 'price7d_catalogue_empty';
  END IF;
  v_body :=
    'BẢNG GIÁ & TƯ VẤN NHẬP HÀNG - '||
    to_char(p_at AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY')||E'\n\n'||
    'Em chào anh/chị ạ!'||E'\n'||
    'Em gửi danh sách mặt hàng có cập nhật giá, đã giao hoặc được đặt tạm trong 7 ngày gần đây để anh/chị tiện cân đối bổ sung theo sức bán.'||E'\n'||
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

CREATE OR REPLACE FUNCTION v21_private.taphoa_price7d_send_ordered(p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
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
BEGIN
  IF v_local::time < time '06:00' OR v_local::time >= time '06:45' THEN
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
    v_full := v21_private.taphoa_price7d_text(p_at);
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
      (business_date,sender_id,receiver_id,zalo_id,body,parts)
    VALUES (v_day,v_sender,v_receiver,v_zalo,v_full,v_parts)
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
    v_prefix:='[BẢNG GIÁ 7 NGÀY - PHẦN '||v_i||'/'||v_n||']';
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
  RETURN jsonb_build_object('ok',true,'status','sent',
    'recipient','Báo Giá - 0911479555','parts',v_n,'business_date',v_day::text);
END;
$function$;

REVOKE ALL ON FUNCTION v21_private.taphoa_price7d_text(timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION v21_private.taphoa_price7d_send_ordered(timestamptz)
  FROM PUBLIC, anon, authenticated;

-- Supabase pg_cron uses UTC: 23:00 UTC is 06:00 next day in Viet Nam.
-- One minute-separated part per run; subsequent part only after Zalo ACK.
SELECT cron.schedule(
  'taphoa-price7d-advisory-0600-vn',
  '0-44 23 * * *',
  $$SELECT v21_private.taphoa_price7d_send_ordered(now());$$
);
