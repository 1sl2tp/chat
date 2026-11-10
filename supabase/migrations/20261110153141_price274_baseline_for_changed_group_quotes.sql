
ALTER TABLE v21_private.taphoa_price7d_batches
 ADD COLUMN IF NOT EXISTS catalogue_snapshot jsonb,
 ADD COLUMN IF NOT EXISTS changed_products integer;

CREATE TABLE IF NOT EXISTS v21_private.taphoa_price7d_delivery_state(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),
 catalogue_snapshot jsonb NOT NULL,
 last_success_date date NOT NULL,
 last_success_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS v21_private.taphoa_price7d_skipped_days(
 business_date date PRIMARY KEY,
 reason text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON v21_private.taphoa_price7d_delivery_state FROM PUBLIC,anon,authenticated;
REVOKE ALL ON v21_private.taphoa_price7d_skipped_days FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_price7d_catalogue_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','v21_private','pg_temp'
AS $price$
 SELECT coalesce(jsonb_object_agg(p.product_code,
   jsonb_build_object('name',btrim(regexp_replace(
      extensions.unaccent(replace(p.product_name,'*','')),'[[:space:]]+',' ','g')),
       'price',p.sale_price_vnd)), '{}'::jsonb)
 FROM public.taphoa_products p
 WHERE p.is_active=true AND p.deleted_at IS NULL
 AND p.input_price_vnd>0 AND p.sale_price_vnd>0
 AND p.source_key<>'thuoc-la'
 AND lower(extensions.unaccent(p.product_name))
   !~ '^(bia|ruou|thuoc la|thuoc|cigar|vape|pod|nicotine)( |$)'
 AND nullif(btrim(p.product_name),'') IS NOT NULL;
$price$;
REVOKE ALL ON FUNCTION v21_private.taphoa_price7d_catalogue_snapshot() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.taphoa_price7d_delta_text(
 p_at timestamptz,p_previous jsonb,p_current jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','v21_private','pg_temp'
AS $price$
DECLARE v_lines text; v_body text;
BEGIN
 WITH changed AS(
   SELECT c.key AS code,c.value->>'name' AS name,
     (c.value->>'price')::numeric AS sale_now,
     (p_previous->c.key->>'price')::numeric AS sale_before
   FROM jsonb_each(p_current) c
   WHERE NOT(p_previous ? c.key)
     OR p_previous->c.key->>'price' IS DISTINCT FROM c.value->>'price'
 )
 SELECT string_agg('- '||CASE WHEN sale_before IS NULL THEN '[MỚI] ' ELSE '' END||
   name||' - '||
   CASE WHEN sale_before>0 AND sale_before<>sale_now AND
      abs(sale_now-sale_before)/sale_before<=0.30
    THEN sale_before::text||' -> '||sale_now::text||' ('||
      CASE WHEN sale_now>sale_before THEN '+' ELSE '' END||
      (sale_now-sale_before)::text||')'
    ELSE sale_now::text END,E'\n' ORDER BY lower(name),name,code)
 INTO v_lines FROM changed;
 IF nullif(v_lines,'') IS NULL THEN RETURN NULL; END IF;
 v_body:='CẬP NHẬT GIÁ & HÀNG MỚI - '||
 to_char(p_at AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY')||E'\n\n'||
 'Em chào anh/chị ạ!'||E'\n'||
 'Chỉ gửi những mặt hàng MỚI hoặc giá bán thay đổi kể từ lần báo giá gửi thành công trước:'||E'\n\n'||
 v_lines||E'\n\n'||
 'Nếu anh/chị đã có giá hỗ trợ riêng, vui lòng nhắn riêng để em đối chiếu; không đăng giá riêng trong nhóm.'||E'\n'||
 'Tình trạng hàng và lịch giao xác nhận khi chốt đơn. Bảng giá đầy đủ: https://app.taphoa.xyz/bao-gia/'||E'\n'||
 'Em cảm ơn anh/chị!';
 IF char_length(v_body)>25000 THEN RAISE EXCEPTION 'price7d_delta_body_excess'; END IF;
 RETURN v_body;
END;
$price$;
REVOKE ALL ON FUNCTION v21_private.taphoa_price7d_delta_text(timestamptz,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

DO $seed$
DECLARE b v21_private.taphoa_price7d_batches%ROWTYPE; i integer;
BEGIN
 IF EXISTS(SELECT 1 FROM v21_private.taphoa_price7d_delivery_state WHERE singleton=true) THEN RETURN; END IF;
 SELECT * INTO b FROM v21_private.taphoa_price7d_batches ORDER BY business_date DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'price7d_no_confirmed_baseline'; END IF;
 FOR i IN 1..cardinality(b.parts) LOOP
   IF NOT EXISTS(
     SELECT 1 FROM public.v21_messages m JOIN public.zalo_message_links z
       ON z.chat_message_id=m.id
     WHERE m.sender_account_id=b.sender_id
       AND m.client_id='advisory:price7d:group:'||to_char(b.business_date,'YYYYMMDD')||
         ':part:'||lpad(i::text,2,'0')
       AND m.deleted_at IS NULL AND z.zalo_id=b.zalo_id
       AND z.direction='outbound' AND z.state='sent'
       AND nullif(z.zalo_message_id,'') IS NOT NULL
   ) THEN RAISE EXCEPTION 'price7d_unsent_old_batch'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM public.taphoa_product_price_history h
             WHERE h.changed_at>b.created_at
               AND h.old_sale IS DISTINCT FROM h.new_sale)
 OR EXISTS (SELECT 1 FROM public.taphoa_products p
             WHERE p.updated_at>b.created_at
               AND p.is_active=true AND p.deleted_at IS NULL)
 THEN RAISE EXCEPTION 'price7d_baseline_needs_reconciliation'; END IF;
 INSERT INTO v21_private.taphoa_price7d_delivery_state(singleton,catalogue_snapshot,last_success_date,last_success_at)
 VALUES (true,v21_private.taphoa_price7d_catalogue_snapshot(),b.business_date,clock_timestamp());
END;
$seed$;
