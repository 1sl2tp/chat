-- ZFR-203: Explicit one-tap Admin request to send a Zalo friend invitation
-- from the currently connected bridge account. No invitation is sent by SQL.
-- Never infer Zalo identity solely from a public zalo.me profile.
CREATE TABLE IF NOT EXISTS public.v21_zalo_friend_actions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 phone text NOT NULL UNIQUE CHECK(phone ~ '^0[0-9]{9}$'),
 requested_by uuid NOT NULL REFERENCES public.v21_accounts(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN
  ('queued','processing','sent','already_sent','already_friends',
   'accepted','not_found','blocked','failed','unknown')),
 zalo_id text,
 zalo_name text,
 error_code text,
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 1),
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS v21_zalo_friend_actions_owner_time_idx
 ON public.v21_zalo_friend_actions(requested_by,created_at DESC);
ALTER TABLE public.v21_zalo_friend_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v21_zalo_friend_actions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.v21_zalo_friend_actions TO service_role;

-- Atomic single claim, with no automatic retry after an uncertain Zalo send.
CREATE OR REPLACE FUNCTION public.chat_zalo_friend_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE picked record;
BEGIN
 WITH next_one AS (
   SELECT id FROM public.v21_zalo_friend_actions
   WHERE status='queued' AND attempt_count=0
   ORDER BY created_at,id
   FOR UPDATE SKIP LOCKED LIMIT 1
 ), claimed AS (
  UPDATE public.v21_zalo_friend_actions j
   SET status='processing',attempt_count=1,
     started_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE j.id IN (SELECT id FROM next_one)
  RETURNING j.id,j.phone
 )
 SELECT * INTO picked FROM claimed;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'job',null); END IF;
 RETURN jsonb_build_object('ok',true,'job',
  jsonb_build_object('id',picked.id,'phone',picked.phone));
END; $$;
REVOKE ALL ON FUNCTION public.chat_zalo_friend_claim() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_zalo_friend_claim() TO service_role;

CREATE OR REPLACE FUNCTION public.chat_zalo_friend_complete(
 p_id uuid,p_status text,p_zalo_id text DEFAULT NULL,
 p_zalo_name text DEFAULT NULL,p_error text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE changed integer;
BEGIN
 IF p_status NOT IN ('sent','already_sent','already_friends','accepted',
  'not_found','blocked','failed','unknown') THEN
   RAISE EXCEPTION 'invalid_friend_action_status';
 END IF;
 UPDATE public.v21_zalo_friend_actions
 SET status=p_status,
   zalo_id=nullif(left(btrim(coalesce(p_zalo_id,'')),64),''),
   zalo_name=nullif(left(btrim(coalesce(p_zalo_name,'')),120),''),
   error_code=nullif(left(btrim(coalesce(p_error,'')),160),''),
   completed_at=clock_timestamp(),updated_at=clock_timestamp()
 WHERE id=p_id AND status='processing';
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN jsonb_build_object('ok',changed=1);
END; $$;
REVOKE ALL ON FUNCTION public.chat_zalo_friend_complete(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chat_zalo_friend_complete(uuid,text,text,text,text)
 TO service_role;
