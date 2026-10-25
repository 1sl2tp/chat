-- HIST-219: secure older chat history, keyset pagination; read only.
CREATE OR REPLACE FUNCTION public.v21_conversation_messages_older(p_app_session_id uuid, p_conversation_id uuid, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth', 'pg_temp'
AS $function$
DECLARE
 v_me uuid;v_limit integer:=least(greatest(coalesce(p_limit,50),1),75);
 v_messages jsonb:='[]'::jsonb;v_media jsonb:='[]'::jsonb;
 v_oldest_at timestamptz;v_oldest_id uuid;v_has_more boolean:=false;
BEGIN
 v_me:=v21_private.require_active_account(p_app_session_id);
 IF p_conversation_id IS NULL OR p_before_at IS NULL OR p_before_id IS NULL OR
   NOT EXISTS(
     SELECT 1 FROM public.v21_conversations c WHERE c.id=p_conversation_id
       AND v_me IN(c.member_a,c.member_b)
   ) THEN
   RAISE EXCEPTION 'history_conversation_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]'::jsonb)
 INTO v_messages FROM (
   SELECT m.id,m.conversation_id,m.sender_account_id,m.client_id,m.body,
     m.reply_to_message_id,m.reply_preview,m.reply_sender_account_id,
     m.created_at,m.updated_at,m.deleted_at,m.version
   FROM public.v21_messages m
   WHERE m.conversation_id=p_conversation_id AND m.deleted_at IS NULL
     AND (m.created_at,m.id)<(p_before_at,p_before_id)
   ORDER BY m.created_at DESC,m.id DESC
   LIMIT v_limit
 ) x;
 IF jsonb_array_length(v_messages)>0 THEN
   SELECT (j.value->>'created_at')::timestamptz,(j.value->>'id')::uuid
   INTO v_oldest_at,v_oldest_id
   FROM jsonb_array_elements(v_messages) j(value)
   ORDER BY (j.value->>'created_at')::timestamptz,(j.value->>'id')::uuid
   LIMIT 1;
   SELECT EXISTS(
     SELECT 1 FROM public.v21_messages m
     WHERE m.conversation_id=p_conversation_id AND m.deleted_at IS NULL
       AND (m.created_at,m.id)<(v_oldest_at,v_oldest_id)
   ) INTO v_has_more;
   SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'id',a.id,'conversation_id',a.conversation_id,
     'message_id',a.message_id,'owner_account_id',a.owner_account_id,
     'kind',a.kind,'file_name',a.file_name,'mime_type',a.mime_type,
     'size_bytes',a.size_bytes,'duration_ms',a.duration_ms,
     'storage_key',a.storage_key,'content_hash',a.content_hash,
     'width_px',a.width_px,'height_px',a.height_px,
     'sort_index',a.sort_index,'created_at',a.created_at,
     'updated_at',a.updated_at,'deleted_at',a.deleted_at,'version',a.version)
      ORDER BY a.created_at,a.message_id,a.sort_index,a.id),'[]'::jsonb)
   INTO v_media FROM public.v21_media_assets a
   WHERE a.conversation_id=p_conversation_id AND a.deleted_at IS NULL
     AND a.message_id IN (
       SELECT (j.value->>'id')::uuid FROM jsonb_array_elements(v_messages) j(value)
     );
 END IF;
 RETURN jsonb_build_object('ok',true,'conversation_id',p_conversation_id,
   'messages',v_messages,'media_assets',v_media,'has_more',v_has_more);
END;
$function$
;
REVOKE ALL ON FUNCTION public.v21_conversation_messages_older(uuid,uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.v21_conversation_messages_older(uuid,uuid,timestamptz,uuid,integer) TO authenticated;
