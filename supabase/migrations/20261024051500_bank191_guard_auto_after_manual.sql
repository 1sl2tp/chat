-- BANK-191 follow-up: automatic collector must refuse a notice already
-- posted manually or explicitly linked to a previously posted receipt.
-- Reuse the collector's existing advisory lock and row lock.
DO $patch$
DECLARE definition text; anchor text := 'if exists(select 1 from public.chat_bank_app_collection_links l';
BEGIN
 SELECT pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure)
 INTO definition;
 IF definition LIKE '%already_manual_collected%' THEN RETURN; END IF;
 IF length(definition)-length(replace(definition,anchor,''))<>length(anchor)
 THEN RAISE EXCEPTION 'bank191_auto_guard_anchor_missing_or_ambiguous'; END IF;
 definition:=replace(definition,anchor,
  'if exists(select 1 from public.chat_bank_manual_collections m where m.notification_id=n.id)
    then return jsonb_build_object(''ok'',false,''status'',''already_manual_collected''); end if;

    '||anchor);
 EXECUTE definition;
END;
$patch$;
