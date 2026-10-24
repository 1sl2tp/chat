-- ZFR-200: Admin-only pending incoming Zalo friend requests.
-- Source = actual Zalo bridge, never inferred from chat contacts or recommendations.
CREATE TABLE IF NOT EXISTS public.v21_zalo_friend_requests(
 zalo_id text PRIMARY KEY,
 display_name text NOT NULL,
 avatar_url text,
 message text,
 request_at timestamptz,
 checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.v21_zalo_friend_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v21_zalo_friend_requests FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.v21_zalo_friend_sync_state(
 id text PRIMARY KEY CHECK(id='primary'),
 last_success_at timestamptz,
 pending_count integer NOT NULL DEFAULT 0 CHECK(pending_count>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.v21_zalo_friend_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v21_zalo_friend_sync_state FROM PUBLIC,anon,authenticated;
INSERT INTO public.v21_zalo_friend_sync_state(id) VALUES('primary') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.v21_zalo_friend_requests_admin(p_app_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE me uuid :=v21_private.require_active_account(p_app_session_id);
v_rows jsonb; v_sync timestamptz; v_count integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts WHERE id=me AND role='admin'
    AND deleted_at IS NULL AND locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 SELECT last_success_at,pending_count INTO v_sync,v_count
 FROM public.v21_zalo_friend_sync_state WHERE id='primary';
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'zalo_id',r.zalo_id,
  'display_name',r.display_name,
  'avatar_url',r.avatar_url,
  'message',r.message,
  'request_at',r.request_at,
  'linked_chat_account_id',l.chat_account_id
 ) ORDER BY r.request_at DESC NULLS LAST,r.display_name),'[]'::jsonb) INTO v_rows
 FROM public.v21_zalo_friend_requests r
 LEFT JOIN public.zalo_user_links l ON l.zalo_id=r.zalo_id;
 RETURN jsonb_build_object('last_sync_at',v_sync,
   'fresh',v_sync IS NOT NULL AND v_sync >= now()-interval '30 minutes',
   'pending_count',coalesce(v_count,0),'requests',v_rows);
END; $$;
REVOKE ALL ON FUNCTION public.v21_zalo_friend_requests_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_zalo_friend_requests_admin(uuid) TO authenticated;
