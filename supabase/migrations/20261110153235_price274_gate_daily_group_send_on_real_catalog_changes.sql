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
    IF EXISTS(SELECT 1 FROM v21_private.taphoa_price7d_skipped_days WHERE business_date=v_day) THEN
      RETURN jsonb_build_object('ok',true,'status','no_change','business_date',v_day::text);
    END IF;
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
    v_catalogue:=v21_private.taphoa_price7d_catalogue_snapshot();
    IF v_catalogue='{}'::jsonb THEN
      RETURN jsonb_build_object('ok',false,'status','catalogue_empty');
    END IF;
    SELECT count(*) INTO v_count FROM jsonb_each(v_catalogue) c
      WHERE NOT (v_base.catalogue_snapshot ? c.key)
        OR v_base.catalogue_snapshot->c.key->>'price'
           IS DISTINCT FROM c.value->>'price';
    IF v_count=0 THEN
      INSERT INTO v21_private.taphoa_price7d_skipped_days(business_date,reason)
        VALUES(v_day,'no_new_product_or_sale_price_change')
        ON CONFLICT (business_date) DO NOTHING;
      RETURN jsonb_build_object('ok',true,'status','no_change','business_date',v_day::text);
    END IF;
    v_full:=v21_private.taphoa_price7d_delta_text(p_at,v_base.catalogue_snapshot,v_catalogue);
    IF nullif(v_full,'') IS NULL THEN RAISE EXCEPTION 'price7d_missing_delta_body'; END IF;
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
    v_prefix:='[CẬP NHẬT BÁO GIÁ - PHẦN '||v_i||'/'||v_n||']';
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
    'changed_products',v_batch.changed_products,'business_date',v_day::text);
END;
$function$;
REVOKE ALL ON FUNCTION v21_private.taphoa_price7d_send_ordered(timestamptz) FROM PUBLIC,anon,authenticated;