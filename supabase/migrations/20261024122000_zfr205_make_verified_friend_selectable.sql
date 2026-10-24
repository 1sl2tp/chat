-- ZFR-205: A freshly accepted Zalo friend must become selectable in the
-- existing Admin 'Chọn Zalo' picker without waiting for the full contact sync.
-- We only insert from a friendship confirmed by the authenticated Zalo bridge.
CREATE OR REPLACE FUNCTION public.chat_zalo_friend_register_verified_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL
   AND NEW.zalo_id ~ '^[0-9]{5,32}$'
   AND btrim(coalesce(NEW.zalo_name,'')) <> '' THEN
  INSERT INTO public.zalo_contacts
    (zalo_id,display_name,profile_name,thread_type,updated_at)
  VALUES(NEW.zalo_id,btrim(NEW.zalo_name),btrim(NEW.zalo_name),'user',clock_timestamp())
  ON CONFLICT(zalo_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_zalo_friend_register_verified_contact()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_chat_zalo_verified_friend_contact
 ON public.v21_zalo_friend_actions;
CREATE TRIGGER trg_chat_zalo_verified_friend_contact
 AFTER UPDATE OF confirmed_at ON public.v21_zalo_friend_actions
 FOR EACH ROW EXECUTE FUNCTION public.chat_zalo_friend_register_verified_contact();

-- Existing verified successes (such as a friend confirmed before this fix).
INSERT INTO public.zalo_contacts
  (zalo_id,display_name,profile_name,thread_type,updated_at)
SELECT j.zalo_id,btrim(j.zalo_name),btrim(j.zalo_name),'user',clock_timestamp()
FROM public.v21_zalo_friend_actions j
WHERE j.confirmed_at IS NOT NULL
 AND j.zalo_id ~ '^[0-9]{5,32}$'
 AND btrim(coalesce(j.zalo_name,'')) <> ''
ON CONFLICT(zalo_id) DO NOTHING;

-- Include users that were already friends when Admin pressed the button,
-- but still require explicit is_friend=1 observed by the logged-in bridge.
CREATE OR REPLACE FUNCTION public.chat_zalo_friend_watch_list()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'zalo_id',t.zalo_id)
    ORDER BY t.created_at),'[]'::jsonb)
 FROM (
  SELECT j.id,j.zalo_id,j.created_at
  FROM public.v21_zalo_friend_actions j
  WHERE j.status IN ('sent','already_sent','already_friends','unknown','accepted')
   AND j.confirmed_at IS NULL
   AND j.zalo_id ~ '^[0-9]{5,32}$'
   AND (j.last_checked_at IS NULL OR j.last_checked_at<now()-interval '2 minutes')
   AND j.created_at>=now()-interval '90 days'
  ORDER BY j.created_at LIMIT 30
 ) t;
$$;
REVOKE ALL ON FUNCTION public.chat_zalo_friend_watch_list() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_zalo_friend_watch_list() TO service_role;

CREATE OR REPLACE FUNCTION public.chat_zalo_friend_watch_result(
 p_id uuid,p_is_friend boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed public.v21_zalo_friend_actions%rowtype;
BEGIN
 UPDATE public.v21_zalo_friend_actions j
 SET last_checked_at=clock_timestamp(),
   status=CASE WHEN p_is_friend IS TRUE THEN 'accepted' ELSE j.status END,
   confirmed_at=CASE WHEN p_is_friend IS TRUE THEN coalesce(j.confirmed_at,clock_timestamp())
     ELSE j.confirmed_at END,
   notify_state=CASE WHEN p_is_friend IS TRUE AND j.confirmed_at IS NULL THEN 'pending'
     ELSE j.notify_state END,
   notify_available_at=CASE WHEN p_is_friend IS TRUE AND j.confirmed_at IS NULL
     THEN clock_timestamp() ELSE j.notify_available_at END,
   updated_at=clock_timestamp()
 WHERE j.id=p_id
  AND j.status IN ('sent','already_sent','already_friends','unknown','accepted')
  AND j.zalo_id IS NOT NULL
 RETURNING j.* INTO changed;
 RETURN jsonb_build_object('ok',found,'status',changed.status,
  'verified',changed.confirmed_at IS NOT NULL,'notify_state',changed.notify_state);
END $$;
REVOKE ALL ON FUNCTION public.chat_zalo_friend_watch_result(uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_zalo_friend_watch_result(uuid,boolean)
 TO service_role;
