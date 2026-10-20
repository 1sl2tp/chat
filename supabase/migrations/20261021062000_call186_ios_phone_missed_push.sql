-- CALL-186: iOS-PWA-compatible customer phonebook and missed-CHAT-call Push.
-- Does not access or claim knowledge of device SIM call history.
CREATE TABLE IF NOT EXISTS public.v21_contact_private_phones(
 contact_account_id uuid PRIMARY KEY REFERENCES public.v21_accounts(id),
 phone_primary text,
 phone_secondary text,
 edited_by_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(phone_primary IS NULL OR phone_primary ~ '^\+?[0-9]{9,15}$'),
 CHECK(phone_secondary IS NULL OR phone_secondary ~ '^\+?[0-9]{9,15}$')
);
ALTER TABLE public.v21_contact_private_phones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v21_contact_private_phones FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v21_admin_contact_phone(
 p_app_session_id uuid, p_contact_id uuid, p_action text DEFAULT 'get',
 p_primary text DEFAULT NULL, p_secondary text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,auth,pg_temp AS $func$
DECLARE v_admin uuid; v_main text; v_second text; v_data record;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
   AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a
   WHERE a.id=p_contact_id AND a.role='user' AND a.deleted_at IS NULL
     AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'contact_not_available'; END IF;
 IF p_action='save' THEN
  v_main:=nullif(regexp_replace(coalesce(p_primary,''),'[\s().-]','','g'),'');
  v_second:=nullif(regexp_replace(coalesce(p_secondary,''),'[\s().-]','','g'),'');
  IF (v_main IS NOT NULL AND v_main !~ '^\+?[0-9]{9,15}$')
    OR (v_second IS NOT NULL AND v_second !~ '^\+?[0-9]{9,15}$')
  THEN RAISE EXCEPTION 'phone_invalid'; END IF;
  INSERT INTO public.v21_contact_private_phones(
   contact_account_id,phone_primary,phone_secondary,edited_by_account_id,updated_at)
  VALUES(p_contact_id,v_main,v_second,v_admin,now())
  ON CONFLICT (contact_account_id) DO UPDATE
  SET phone_primary=excluded.phone_primary,phone_secondary=excluded.phone_secondary,
      edited_by_account_id=excluded.edited_by_account_id,updated_at=excluded.updated_at;
 ELSIF p_action <> 'get' THEN
  RAISE EXCEPTION 'action_invalid';
 END IF;
 SELECT phone_primary,phone_secondary,updated_at,edited_by_account_id
 INTO v_data FROM public.v21_contact_private_phones
 WHERE contact_account_id=p_contact_id;
 RETURN jsonb_build_object('ok',true,'contact_id',p_contact_id,
  'phone_primary',v_data.phone_primary,'phone_secondary',v_data.phone_secondary,
  'updated_at',v_data.updated_at);
END;
$func$;
REVOKE ALL ON FUNCTION public.v21_admin_contact_phone(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.v21_admin_contact_phone(uuid,uuid,text,text,text)
 TO authenticated;

CREATE TABLE IF NOT EXISTS public.v21_missed_call_push_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_kind text NOT NULL CHECK(source_kind IN ('v21_call','guest_invite')),
 source_id uuid NOT NULL,
 recipient_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 contact_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','retry','sent','dead')),
 available_at timestamptz NOT NULL DEFAULT now(),
 attempt_count int NOT NULL DEFAULT 0,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_kind,source_id,recipient_account_id)
);
CREATE INDEX IF NOT EXISTS v21_missed_call_push_ready
 ON public.v21_missed_call_push_outbox(state,available_at,created_at)
 WHERE state IN ('pending','retry');
ALTER TABLE public.v21_missed_call_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v21_missed_call_push_outbox FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION v21_private.enqueue_missed_chat_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $func$
BEGIN
 IF new.status NOT IN ('MISSED','CANCELLED') OR
    old.status IS NOT DISTINCT FROM new.status OR old.status<>'RINGING'
    OR new.accepted_at IS NOT NULL OR new.caller_account_id=new.callee_account_id
 THEN RETURN new; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a WHERE a.id=new.callee_account_id
    AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.v21_accounts a WHERE a.id=new.caller_account_id
    AND a.role='user' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RETURN new; END IF;
 INSERT INTO public.v21_missed_call_push_outbox(
  source_kind,source_id,recipient_account_id,contact_id)
 VALUES('v21_call',new.id,new.callee_account_id,new.caller_account_id)
 ON CONFLICT DO NOTHING;
 RETURN new;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'missed_chat_call_push_skipped: %',SQLSTATE;
 RETURN new;
END;
$func$;

CREATE OR REPLACE FUNCTION v21_private.enqueue_missed_guest_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $func$
DECLARE v_admin uuid; v_contact uuid;
BEGIN
 IF new.guest_joined_at IS NULL OR new.admin_joined_at IS NOT NULL
    OR old.ended_at IS NOT DISTINCT FROM new.ended_at
       AND old.revoked_at IS NOT DISTINCT FROM new.revoked_at
    OR new.ended_at IS NULL AND new.revoked_at IS NULL
    OR new.contact_id !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN RETURN new; END IF;
 v_contact:=new.contact_id::uuid;
 SELECT a.id INTO v_admin FROM public.v21_accounts a
 WHERE a.auth_user_id=new.created_by_account_id AND a.role='admin'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL LIMIT 1;
 IF v_admin IS NULL OR NOT EXISTS(SELECT 1 FROM public.v21_accounts a
   WHERE a.id=v_contact AND a.role='user' AND a.deleted_at IS NULL)
 THEN RETURN new; END IF;
 INSERT INTO public.v21_missed_call_push_outbox(
  source_kind,source_id,recipient_account_id,contact_id)
 VALUES('guest_invite',new.id,v_admin,v_contact)
 ON CONFLICT DO NOTHING;
 RETURN new;
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'missed_guest_invite_push_skipped: %',SQLSTATE;
 RETURN new;
END;
$func$;
DROP TRIGGER IF EXISTS v21_missed_chat_call_trg ON public.v21_calls;
CREATE TRIGGER v21_missed_chat_call_trg
 AFTER UPDATE OF status ON public.v21_calls FOR EACH ROW
 EXECUTE FUNCTION v21_private.enqueue_missed_chat_call();
DROP TRIGGER IF EXISTS v21_missed_guest_invite_trg ON public.chat_call_invites;
CREATE TRIGGER v21_missed_guest_invite_trg
 AFTER UPDATE OF ended_at,revoked_at ON public.chat_call_invites FOR EACH ROW
 EXECUTE FUNCTION v21_private.enqueue_missed_guest_invite();
DROP TRIGGER IF EXISTS v21_missed_push_signal_trg ON public.v21_missed_call_push_outbox;
CREATE TRIGGER v21_missed_push_signal_trg
 AFTER INSERT ON public.v21_missed_call_push_outbox FOR EACH ROW WHEN(new.state='pending')
 EXECUTE FUNCTION v21_private.admin_push_signal();

CREATE OR REPLACE FUNCTION public.v21_missed_call_push_claim(p_limit integer DEFAULT 12)
RETURNS SETOF public.v21_missed_call_push_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $func$
BEGIN
 RETURN QUERY
 WITH ready AS (
  SELECT id FROM public.v21_missed_call_push_outbox
  WHERE state IN ('pending','retry') AND available_at<=now()
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED
  LIMIT LEAST(GREATEST(COALESCE(p_limit,12),1),20)
 )
 UPDATE public.v21_missed_call_push_outbox q
 SET state='processing',attempt_count=q.attempt_count+1,updated_at=now()
 FROM ready WHERE q.id=ready.id RETURNING q.*;
END;
$func$;
REVOKE ALL ON FUNCTION public.v21_missed_call_push_claim(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.v21_missed_call_push_claim(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.v21_missed_call_push_result(
 p_id uuid,p_ok boolean,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $func$
BEGIN
 UPDATE public.v21_missed_call_push_outbox
 SET state=CASE WHEN p_ok THEN 'sent' WHEN attempt_count>=4 THEN 'dead' ELSE 'retry' END,
 last_error=left(p_error,400),updated_at=now(),
 available_at=CASE WHEN p_ok THEN now() ELSE
  now()+make_interval(secs=>LEAST(300,15*(2^GREATEST(0,attempt_count-1))::int)) END
 WHERE id=p_id AND state='processing';
END;
$func$;
REVOKE ALL ON FUNCTION public.v21_missed_call_push_result(uuid,boolean,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.v21_missed_call_push_result(uuid,boolean,text)
 TO service_role;