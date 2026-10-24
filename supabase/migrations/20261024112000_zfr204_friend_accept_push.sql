-- ZFR-204: background confirmation & one-time Admin Web Push for Zalo friends.
-- The bridge ONLY verifies Zalo is_friend=1; no add-friend is retried here.
ALTER TABLE public.v21_zalo_friend_actions
 ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
 ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
 ADD COLUMN IF NOT EXISTS notify_state text NOT NULL DEFAULT 'none',
 ADD COLUMN IF NOT EXISTS notify_attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS notify_available_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS notified_at timestamptz,
 ADD COLUMN IF NOT EXISTS notify_error text;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.v21_zalo_friend_actions'::regclass
   AND conname='v21_zalo_friend_actions_notify_state_check') THEN
  ALTER TABLE public.v21_zalo_friend_actions ADD CONSTRAINT
   v21_zalo_friend_actions_notify_state_check
   CHECK(notify_state IN ('none','pending','processing','retry','sent','dead'));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.chat_zalo_friend_watch_list()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'zalo_id',t.zalo_id)
    ORDER BY t.created_at),'[]'::jsonb)
 FROM (
  SELECT j.id,j.zalo_id,j.created_at
  FROM public.v21_zalo_friend_actions j
  WHERE j.status IN ('sent','already_sent','unknown','accepted')
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
 -- No arbitrary status change: the authorized bridge must observe Zalo's
 -- explicit is_friend=1. Negative checks never erase previous confirmations.
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
  AND j.status IN ('sent','already_sent','unknown','accepted')
  AND j.zalo_id IS NOT NULL
 RETURNING j.* INTO changed;
 RETURN jsonb_build_object('ok',found,'status',changed.status,
  'verified',changed.confirmed_at IS NOT NULL,'notify_state',changed.notify_state);
END $$;
REVOKE ALL ON FUNCTION public.chat_zalo_friend_watch_result(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_zalo_friend_watch_result(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.chat_zalo_friend_push_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE picked public.v21_zalo_friend_actions%rowtype;
BEGIN
 WITH next_one AS(
   SELECT id FROM public.v21_zalo_friend_actions
   WHERE status='accepted' AND confirmed_at IS NOT NULL
     AND notify_state IN ('pending','retry')
     AND notify_available_at<=now() AND notify_attempts<5
   ORDER BY confirmed_at,id FOR UPDATE SKIP LOCKED LIMIT 1
 ), claimed AS(
   UPDATE public.v21_zalo_friend_actions j
   SET notify_state='processing',notify_attempts=j.notify_attempts+1,
     updated_at=clock_timestamp()
   WHERE j.id IN (SELECT id FROM next_one) RETURNING j.*
 )
 SELECT * INTO picked FROM claimed;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'job',null); END IF;
 RETURN jsonb_build_object('ok',true,'job',
  jsonb_build_object('id',picked.id,'recipient',picked.requested_by,
    'zalo_name',coalesce(nullif(picked.zalo_name,''),'Người dùng Zalo'),
    'attempt',picked.notify_attempts));
END $$;
REVOKE ALL ON FUNCTION public.chat_zalo_friend_push_claim() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_zalo_friend_push_claim() TO service_role;

CREATE OR REPLACE FUNCTION public.chat_zalo_friend_push_result(
 p_id uuid,p_ok boolean,p_error text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE count_changed integer;
BEGIN
 UPDATE public.v21_zalo_friend_actions j SET
   notify_state=CASE WHEN p_ok THEN 'sent'
                     WHEN j.notify_attempts>=5 THEN 'dead' ELSE 'retry' END,
   notify_available_at=CASE WHEN p_ok THEN now()
                      ELSE now()+make_interval(secs=>least(1800,60*j.notify_attempts)) END,
   notified_at=CASE WHEN p_ok THEN clock_timestamp() ELSE j.notified_at END,
   notify_error=CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error,'push_failed'),240) END,
   updated_at=clock_timestamp()
 WHERE j.id=p_id AND j.notify_state='processing';
 GET DIAGNOSTICS count_changed=ROW_COUNT;
 RETURN jsonb_build_object('ok',count_changed=1);
END $$;
REVOKE ALL ON FUNCTION public.chat_zalo_friend_push_result(uuid,boolean,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_zalo_friend_push_result(uuid,boolean,text)
 TO service_role;
