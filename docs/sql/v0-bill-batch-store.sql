-- Candidate: audit-only durable Batch job store. Apply only after synthetic DB CI.
-- Assumes the existing v0_private bill_audit_annotations contract.
BEGIN;
CREATE TABLE v0_private.bill_batch_jobs(
 id uuid PRIMARY KEY,
 model text NOT NULL CHECK(model='gemini-3.5-flash-lite'),
 state text NOT NULL CHECK(state IN ('submitting','submitted','ambiguous','complete','failed')),
 operation text UNIQUE CHECK(operation ~ '^batches/[A-Za-z0-9_-]{1,200}$'),
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='array' AND jsonb_array_length(manifest) BETWEEN 1 AND 50 AND octet_length(manifest::text)<64000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 batch_completed_at timestamptz
);
CREATE TABLE v0_private.bill_batch_items(
 job_id uuid NOT NULL REFERENCES v0_private.bill_batch_jobs(id),
 receipt_id uuid NOT NULL, admin_account_id uuid NOT NULL,
 image_sha256 text NOT NULL CHECK(image_sha256 ~ '^[0-9a-f]{64}$'),
 raw_hash text NOT NULL CHECK(raw_hash ~ '^[0-9a-f]{32}$'),
 stage integer NOT NULL CHECK(stage IN (1,2)),
 revision integer NOT NULL CHECK(revision>=0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','saved','needs_review','stale','failed')),
 PRIMARY KEY(receipt_id,stage,revision), UNIQUE(job_id,receipt_id),
 batch_completed_at timestamptz, saved_at timestamptz,
 field_status jsonb CHECK(field_status IS NULL OR (jsonb_typeof(field_status)='object' AND octet_length(field_status::text)<2048))
);
ALTER TABLE v0_private.bill_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE v0_private.bill_batch_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON v0_private.bill_batch_jobs,v0_private.bill_batch_items FROM PUBLIC,anon,authenticated,service_role;
-- Serialize reservations; one short-lived transaction, never during network I/O.
-- The only callers are existing trusted server workers; no user/browser RPC access.
CREATE FUNCTION v0_private.bill_batch_reserve(p_job uuid,p_model text,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE existing v0_private.bill_batch_jobs%ROWTYPE; n integer; v jsonb; rid uuid; h text; rawh text; adm uuid; rev integer; st integer;
BEGIN
 IF p_job IS NULL OR p_model IS DISTINCT FROM 'gemini-3.5-flash-lite' OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 OR octet_length(p_items::text)>=64000 THEN RAISE EXCEPTION 'invalid_batch' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(812701337);
 SELECT * INTO existing FROM v0_private.bill_batch_jobs WHERE id=p_job;
 IF FOUND THEN
   IF existing.manifest<>p_items OR existing.model<>p_model THEN RAISE EXCEPTION 'manifest_mismatch'; END IF;
   RETURN jsonb_build_object('acquired',false,'state',existing.state,'operation',existing.operation);
 END IF;
 INSERT INTO v0_private.bill_batch_jobs(id,model,state,manifest) VALUES(p_job,p_model,'submitting',p_items);
 FOR v IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  rid:=(v->>'receipt_id')::uuid;h:=v->>'image_sha256';rev:=(v->>'revision')::integer;st:=(v->>'stage')::integer;
  IF rid IS NULL OR h IS NULL OR h !~ '^[0-9a-f]{64}$' OR rev IS NULL OR rev<0 OR st IS NULL OR st NOT IN (1,2) OR v->>'key' IS DISTINCT FROM rid::text||':'||st||':'||rev THEN RAISE EXCEPTION 'invalid_item'; END IF;
  SELECT count(*),min(md5(coalesce(r.raw_read::text,''))),min(ad.id::text)::uuid INTO n,rawh,adm
  FROM public.chat_bank_bill_receipts r
  JOIN public.v21_media_assets a ON a.id=r.media_asset_id AND a.message_id=r.message_id AND a.owner_account_id=r.customer_account_id AND a.deleted_at IS NULL AND a.mime_type LIKE 'image/%'
  JOIN public.v21_messages m ON m.id=a.message_id AND m.conversation_id=a.conversation_id AND m.deleted_at IS NULL
  JOIN public.v21_conversations c ON c.id=a.conversation_id AND r.customer_account_id IN(c.member_a,c.member_b)
  JOIN public.v21_accounts cust ON cust.id=r.customer_account_id AND cust.role='user' AND cust.deleted_at IS NULL AND cust.locked_at IS NULL
  JOIN public.v21_accounts ad ON ad.id IN(c.member_a,c.member_b) AND ad.id<>cust.id AND ad.role='admin' AND ad.deleted_at IS NULL AND ad.locked_at IS NULL
  LEFT JOIN v0_private.bill_audit_annotations ann ON ann.receipt_id=r.id AND ann.admin_account_id=ad.id AND ann.raw_hash=md5(coalesce(r.raw_read::text,''))
  WHERE r.id=rid AND r.image_sha256=h AND r.status IN ('received','review','amount_read','duplicate') AND r.receiving_account ~ '9{4,6}$' AND coalesce(ann.revision,0)=rev;
  IF n<>1 THEN RAISE EXCEPTION 'stale_or_out_of_scope'; END IF;
  -- Stage 2 requires a completed first stage for this exact original.
  IF st=2 AND NOT EXISTS(SELECT 1 FROM v0_private.bill_batch_items i WHERE i.receipt_id=rid AND i.image_sha256=h AND i.raw_hash=rawh AND i.stage=1 AND i.state='needs_review') THEN RAISE EXCEPTION 'stage_one_required'; END IF;
  INSERT INTO v0_private.bill_batch_items(job_id,receipt_id,admin_account_id,image_sha256,raw_hash,stage,revision)
  VALUES(p_job,rid,adm,h,rawh,st,rev);
 END LOOP;
 RETURN jsonb_build_object('acquired',true,'state','submitting','operation',NULL);
EXCEPTION WHEN unique_violation THEN
 -- Entire function subtransaction rolls back, including any earlier items.
 RETURN jsonb_build_object('acquired',false,'state','already_reserved','operation',NULL);
END;
$f$;
CREATE FUNCTION v0_private.bill_batch_transition(p_job uuid,p_operation text,p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE j v0_private.bill_batch_jobs%ROWTYPE;
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('submitted','ambiguous') OR (p_state='submitted' AND p_operation IS NULL) OR (p_operation IS NOT NULL AND p_operation !~ '^batches/[A-Za-z0-9_-]{1,200}$') THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 UPDATE v0_private.bill_batch_jobs SET state=p_state,operation=coalesce(p_operation,operation),updated_at=now()
 WHERE id=p_job AND state='submitting' AND (operation IS NULL OR operation=p_operation) RETURNING * INTO j;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_job_state'; END IF;
 RETURN jsonb_build_object('state',j.state,'operation',j.operation);
END;
$f$;
CREATE FUNCTION v0_private.bill_batch_save(p_job uuid,p_receipt uuid,p_completed timestamptz,p_corrections jsonb,p_fields jsonb,p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE i v0_private.bill_batch_items%ROWTYPE; j v0_private.bill_batch_jobs%ROWTYPE; current_hash text; n integer; saved_revision integer;
BEGIN
 SELECT * INTO j FROM v0_private.bill_batch_jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR j.state NOT IN ('submitted','complete') OR j.operation IS NULL THEN RAISE EXCEPTION 'job_not_submitted'; END IF;
 SELECT * INTO i FROM v0_private.bill_batch_items WHERE job_id=p_job AND receipt_id=p_receipt FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'item_not_reserved'; END IF;
 IF i.state<>'reserved' THEN RETURN jsonb_build_object('state',i.state,'saved_at',i.saved_at); END IF;
 IF p_state IS NULL OR p_state NOT IN ('saved','needs_review','failed') OR p_completed IS NOT NULL AND (p_completed<j.created_at OR p_completed>now()+interval '5 minutes') THEN RAISE EXCEPTION 'invalid_result'; END IF;
 IF p_corrections IS NULL OR jsonb_typeof(p_corrections)<>'object' OR octet_length(p_corrections::text)>8000 OR p_fields IS NULL OR jsonb_typeof(p_fields)<>'object' OR octet_length(p_fields::text)>2048 THEN RAISE EXCEPTION 'invalid_result'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_corrections) x WHERE x.key NOT IN ('amount_vnd','date_raw','clock','account_raw','recipient','memo','reference','trace','sending_bank','receiving_bank') OR jsonb_typeof(x.value) NOT IN ('string','null') OR char_length(x.value#>>'{}')>1000 OR (x.key='amount_vnd' AND jsonb_typeof(x.value)='string' AND (x.value#>>'{}') !~ '^[1-9][0-9]{0,11}$') OR (x.key='clock' AND jsonb_typeof(x.value)='string' AND (x.value#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') OR (x.key='date_raw' AND jsonb_typeof(x.value)='string' AND (x.value#>>'{}') !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$')) THEN RAISE EXCEPTION 'invalid_correction'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_fields) x WHERE x.key NOT IN ('amount_vnd','date_raw','clock','account_raw','recipient','memo','reference','trace','sending_bank','receiving_bank') OR jsonb_typeof(x.value)<>'string' OR (x.value#>>'{}') NOT IN ('read','unreadable','absent','unknown')) THEN RAISE EXCEPTION 'invalid_field_status'; END IF;
 IF p_state='failed' THEN UPDATE v0_private.bill_batch_items SET state='failed',batch_completed_at=p_completed WHERE job_id=p_job AND receipt_id=p_receipt;
 ELSE
  SELECT md5(coalesce(r.raw_read::text,'')) INTO current_hash
  FROM public.chat_bank_bill_receipts r
  JOIN public.v21_media_assets a ON a.id=r.media_asset_id AND a.message_id=r.message_id AND a.owner_account_id=r.customer_account_id AND a.deleted_at IS NULL
  JOIN public.v21_messages m ON m.id=a.message_id AND m.conversation_id=a.conversation_id AND m.deleted_at IS NULL
  JOIN public.v21_conversations c ON c.id=a.conversation_id AND i.admin_account_id IN(c.member_a,c.member_b) AND r.customer_account_id IN(c.member_a,c.member_b)
  JOIN public.v21_accounts cust ON cust.id=r.customer_account_id AND cust.role='user' AND cust.deleted_at IS NULL AND cust.locked_at IS NULL
  JOIN public.v21_accounts ad ON ad.id=i.admin_account_id AND ad.id<>cust.id AND ad.role='admin' AND ad.deleted_at IS NULL AND ad.locked_at IS NULL
  WHERE r.id=i.receipt_id AND r.image_sha256=i.image_sha256 AND r.status IN ('received','review','amount_read','duplicate') FOR SHARE OF r;
  IF current_hash IS DISTINCT FROM i.raw_hash THEN p_state:='stale';
  ELSE
   -- Only update audit display. Never overwrite an intervening manual edit.
   IF i.revision=0 THEN
    INSERT INTO v0_private.bill_audit_annotations(receipt_id,admin_account_id,raw_hash,review_state,corrections,note,revision)
    VALUES(i.receipt_id,i.admin_account_id,i.raw_hash,'pending',p_corrections,'AI Batch: '||p_job::text,1)
    ON CONFLICT DO NOTHING RETURNING revision INTO saved_revision;
   ELSE
    UPDATE v0_private.bill_audit_annotations SET corrections=corrections||p_corrections,note='AI Batch: '||p_job::text,review_state='pending',revision=revision+1,updated_at=now()
    WHERE receipt_id=i.receipt_id AND admin_account_id=i.admin_account_id AND raw_hash=i.raw_hash AND revision=i.revision AND review_state='pending' RETURNING revision INTO saved_revision;
   END IF;
   IF saved_revision IS NULL THEN p_state:='stale'; END IF;
  END IF;
  UPDATE v0_private.bill_batch_items SET state=p_state,batch_completed_at=p_completed,field_status=p_fields,saved_at=CASE WHEN p_state IN ('saved','needs_review') THEN now() ELSE NULL END WHERE job_id=p_job AND receipt_id=p_receipt;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM v0_private.bill_batch_items WHERE job_id=p_job AND state='reserved') THEN
  UPDATE v0_private.bill_batch_jobs SET state='complete',batch_completed_at=p_completed,updated_at=now() WHERE id=p_job;
 END IF;
 RETURN (SELECT jsonb_build_object('state',x.state,'saved_at',x.saved_at,'ledger_written',false) FROM v0_private.bill_batch_items x WHERE x.job_id=p_job AND x.receipt_id=p_receipt);
END;
$f$;
-- Do not give any public role direct table access. RPC wrappers are invokers.
REVOKE ALL ON FUNCTION v0_private.bill_batch_reserve(uuid,text,jsonb),v0_private.bill_batch_transition(uuid,text,text),v0_private.bill_batch_save(uuid,uuid,timestamptz,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA v0_private TO service_role;
GRANT EXECUTE ON FUNCTION v0_private.bill_batch_reserve(uuid,text,jsonb),v0_private.bill_batch_transition(uuid,text,text),v0_private.bill_batch_save(uuid,uuid,timestamptz,jsonb,jsonb,text) TO service_role;
CREATE FUNCTION public.v0_bill_batch_reserve(p_job uuid,p_model text,p_items jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT v0_private.bill_batch_reserve(p_job,p_model,p_items) $f$;
CREATE FUNCTION public.v0_bill_batch_transition(p_job uuid,p_operation text,p_state text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT v0_private.bill_batch_transition(p_job,p_operation,p_state) $f$;
CREATE FUNCTION public.v0_bill_batch_save(p_job uuid,p_receipt uuid,p_completed timestamptz,p_corrections jsonb,p_fields jsonb,p_state text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ SELECT v0_private.bill_batch_save(p_job,p_receipt,p_completed,p_corrections,p_fields,p_state) $f$;
REVOKE ALL ON FUNCTION public.v0_bill_batch_reserve(uuid,text,jsonb),public.v0_bill_batch_transition(uuid,text,text),public.v0_bill_batch_save(uuid,uuid,timestamptz,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.v0_bill_batch_reserve(uuid,text,jsonb),public.v0_bill_batch_transition(uuid,text,text),public.v0_bill_batch_save(uuid,uuid,timestamptz,jsonb,jsonb,text) TO service_role;
-- Only return the approved admin's eligible historical originals. No arbitrary storage path input.
CREATE FUNCTION v0_private.bill_batch_candidates(p_admin uuid,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE result jsonb;
BEGIN
 IF p_admin IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_candidate_scope'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.receipt_id),'[]'::jsonb) INTO result FROM (
  SELECT r.id AS receipt_id,r.image_sha256,md5(coalesce(r.raw_read::text,'')) AS raw_hash,0 AS revision,a.storage_key,a.mime_type
  FROM public.chat_bank_bill_receipts r
  JOIN public.v21_media_assets a ON a.id=r.media_asset_id AND a.message_id=r.message_id AND a.owner_account_id=r.customer_account_id AND a.deleted_at IS NULL AND a.mime_type IN ('image/jpeg','image/jpg','image/png','image/webp')
  JOIN public.v21_messages m ON m.id=a.message_id AND m.conversation_id=a.conversation_id AND m.deleted_at IS NULL
  JOIN public.v21_conversations c ON c.id=a.conversation_id AND p_admin IN(c.member_a,c.member_b) AND r.customer_account_id IN(c.member_a,c.member_b)
  JOIN public.v21_accounts ad ON ad.id=p_admin AND ad.role='admin' AND ad.deleted_at IS NULL AND ad.locked_at IS NULL
  JOIN public.v21_accounts cust ON cust.id=r.customer_account_id AND cust.id<>p_admin AND cust.role='user' AND cust.deleted_at IS NULL AND cust.locked_at IS NULL
  WHERE r.status IN ('received','review','amount_read','duplicate') AND r.receiving_account ~ '9{4,6}$' AND r.image_sha256 ~ '^[0-9a-f]{64}$'
    AND NOT EXISTS(SELECT 1 FROM v0_private.bill_audit_annotations n WHERE n.receipt_id=r.id AND n.admin_account_id=p_admin AND n.raw_hash=md5(coalesce(r.raw_read::text,'')))
    AND NOT EXISTS(SELECT 1 FROM v0_private.bill_batch_items i WHERE i.receipt_id=r.id AND i.stage=1 AND i.revision=0)
  ORDER BY r.id LIMIT p_limit
 ) x;
 RETURN result;
END;
$f$;
CREATE FUNCTION v0_private.bill_batch_job(p_admin uuid,p_job uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE j v0_private.bill_batch_jobs%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts ad WHERE ad.id=p_admin AND ad.role='admin' AND ad.deleted_at IS NULL AND ad.locked_at IS NULL) THEN RAISE EXCEPTION 'admin_required'; END IF;
 SELECT * INTO j FROM v0_private.bill_batch_jobs WHERE id=p_job
 AND EXISTS(SELECT 1 FROM v0_private.bill_batch_items i WHERE i.job_id=p_job AND i.admin_account_id=p_admin)
 AND NOT EXISTS(SELECT 1 FROM v0_private.bill_batch_items i WHERE i.job_id=p_job AND i.admin_account_id<>p_admin);
 IF NOT FOUND THEN RAISE EXCEPTION 'job_not_in_scope'; END IF;
 RETURN jsonb_build_object('jobId',j.id,'model',j.model,'items',j.manifest,'operation',j.operation,'state',j.state);
END;
$f$;
REVOKE ALL ON FUNCTION v0_private.bill_batch_candidates(uuid,integer),v0_private.bill_batch_job(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION v0_private.bill_batch_candidates(uuid,integer),v0_private.bill_batch_job(uuid,uuid) TO service_role;
CREATE FUNCTION public.v0_bill_batch_candidates(p_admin uuid,p_limit integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$ SELECT v0_private.bill_batch_candidates(p_admin,p_limit) $f$;
CREATE FUNCTION public.v0_bill_batch_job(p_admin uuid,p_job uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$ SELECT v0_private.bill_batch_job(p_admin,p_job) $f$;
REVOKE ALL ON FUNCTION public.v0_bill_batch_candidates(uuid,integer),public.v0_bill_batch_job(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.v0_bill_batch_candidates(uuid,integer),public.v0_bill_batch_job(uuid,uuid) TO service_role;
COMMIT;
