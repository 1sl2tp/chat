-- Synthetic database only. Run in a fresh ephemeral PostgreSQL database.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA v0_private;
CREATE TABLE public.v21_accounts(id uuid PRIMARY KEY,role text,deleted_at timestamptz,locked_at timestamptz);
CREATE TABLE public.v21_conversations(id uuid PRIMARY KEY,member_a uuid,member_b uuid);
CREATE TABLE public.v21_messages(id uuid PRIMARY KEY,conversation_id uuid,deleted_at timestamptz);
CREATE TABLE public.v21_media_assets(id uuid PRIMARY KEY,message_id uuid,owner_account_id uuid,conversation_id uuid,deleted_at timestamptz,mime_type text);
CREATE TABLE public.chat_bank_bill_receipts(id uuid PRIMARY KEY,media_asset_id uuid,message_id uuid,customer_account_id uuid,status text,receiving_account text,image_sha256 text,raw_read jsonb,amount_vnd bigint,ledger_id bigint);
CREATE TABLE v0_private.bill_audit_annotations(receipt_id uuid,admin_account_id uuid,raw_hash text,review_state text,corrections jsonb,note text,revision integer,updated_at timestamptz DEFAULT now(),PRIMARY KEY(receipt_id,admin_account_id,raw_hash));
\ir ../../docs/sql/v0-bill-batch-store.sql
INSERT INTO public.v21_accounts(id,role) VALUES('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','user');
INSERT INTO public.v21_conversations VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
INSERT INTO public.v21_messages(id,conversation_id) VALUES('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003');
INSERT INTO public.v21_media_assets(id,message_id,owner_account_id,conversation_id,mime_type) VALUES('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','image/jpeg');
INSERT INTO public.chat_bank_bill_receipts VALUES('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','received','2901181999999',repeat('a',64),'{"fixture":true}',20000,777);
DO $test$
BEGIN
 IF has_function_privilege('authenticated','public.v0_bill_batch_reserve(uuid,text,jsonb)','EXECUTE') OR has_function_privilege('anon','public.v0_bill_batch_save(uuid,uuid,timestamptz,jsonb,jsonb,text)','EXECUTE') OR has_table_privilege('service_role','v0_private.bill_batch_items','SELECT') THEN RAISE EXCEPTION 'privilege leak'; END IF;
END $test$;
SET ROLE service_role;
DO $test$
DECLARE rid uuid:='00000000-0000-0000-0000-000000000006'; jid uuid:='00000000-0000-0000-0000-000000000007'; other uuid:='00000000-0000-0000-0000-000000000008'; items jsonb; result jsonb;
BEGIN
 items:=jsonb_build_array(jsonb_build_object('receipt_id',rid,'image_sha256',repeat('a',64),'revision',0,'stage',1,'key',rid::text||':1:0'));
 result:=public.v0_bill_batch_reserve(jid,'gemini-3.5-flash-lite',items);
 IF result->>'acquired' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'reserve failed'; END IF;
 result:=public.v0_bill_batch_reserve(jid,'gemini-3.5-flash-lite',items);
 IF result->>'acquired' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'repeat charge'; END IF;
 result:=public.v0_bill_batch_reserve(other,'gemini-3.5-flash-lite',items);
 IF result->>'acquired' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'duplicate job allowed'; END IF;
 PERFORM public.v0_bill_batch_transition(jid,'batches/fixture','submitted');
 result:=public.v0_bill_batch_save(jid,rid,now(),'{"memo":"fixture read"}','{"memo":"read"}','saved');
 IF result->>'state' IS DISTINCT FROM 'saved' OR result->>'saved_at' IS NULL OR result->>'ledger_written' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'save failed'; END IF;
 result:=public.v0_bill_batch_save(jid,rid,now(),'{"memo":"should not overwrite"}','{"memo":"read"}','saved');
 IF result->>'state' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'replay failed'; END IF;
END $test$;
RESET ROLE;
DO $test$ BEGIN
 IF (SELECT count(*) FROM v0_private.bill_batch_jobs)<>1 THEN RAISE EXCEPTION 'orphan duplicate job'; END IF;
 IF (SELECT corrections->>'memo' FROM v0_private.bill_audit_annotations) IS DISTINCT FROM 'fixture read' OR (SELECT revision FROM v0_private.bill_audit_annotations)<>1 THEN RAISE EXCEPTION 'audit replay changed data'; END IF;
 IF EXISTS(SELECT 1 FROM public.chat_bank_bill_receipts WHERE status<>'received' OR amount_vnd<>20000 OR ledger_id<>777 OR raw_read<>'{"fixture":true}'::jsonb) THEN RAISE EXCEPTION 'financial data changed'; END IF;
END $test$;
SELECT 'bill batch store synthetic fixture PASS' AS result;
