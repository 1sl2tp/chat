-- FRIEND-199: Chat-user friendship invitations reviewed by Admin.
-- Phone-created Chat accounts are handled separately by v21-zalo-admin.
CREATE TABLE IF NOT EXISTS public.v21_friend_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_account_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 recipient_admin_id uuid NOT NULL REFERENCES public.v21_accounts(id),
 status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 responded_at timestamptz,
 UNIQUE(sender_account_id,recipient_admin_id),
 CHECK(sender_account_id<>recipient_admin_id)
);
ALTER TABLE public.v21_friend_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v21_friend_invitations FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v21_friend_invitation_send(p_app_session_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,v21_private,pg_temp AS $$
DECLARE me uuid; admin_id uuid; invite public.v21_friend_invitations%rowtype;
BEGIN
 me:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts WHERE id=me
   AND role='user' AND deleted_at IS NULL AND locked_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'status','user_only');
 END IF;
 SELECT id INTO admin_id FROM public.v21_accounts
  WHERE role='admin' AND deleted_at IS NULL AND locked_at IS NULL
  ORDER BY created_at,id LIMIT 1;
 IF admin_id IS NULL THEN RETURN jsonb_build_object('ok',false,'status','admin_unavailable'); END IF;
 INSERT INTO public.v21_friend_invitations(sender_account_id,recipient_admin_id)
 VALUES(me,admin_id) ON CONFLICT(sender_account_id,recipient_admin_id)
 DO UPDATE SET status='pending',created_at=now(),responded_at=NULL
 WHERE public.v21_friend_invitations.status='rejected'
   AND public.v21_friend_invitations.responded_at<now()-interval '7 days'
 RETURNING * INTO invite;
 IF NOT FOUND THEN
  SELECT * INTO invite FROM public.v21_friend_invitations
  WHERE sender_account_id=me AND recipient_admin_id=admin_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'status',invite.status,'id',invite.id,
   'created_at',invite.created_at);
END;$$;
REVOKE ALL ON FUNCTION public.v21_friend_invitation_send(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_friend_invitation_send(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v21_friend_invitations_admin(p_app_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE me uuid; rows jsonb;
BEGIN
 me:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts WHERE id=me
  AND role='admin' AND deleted_at IS NULL AND locked_at IS NULL) THEN
  RAISE EXCEPTION 'admin_only' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'name',a.display_name,'username',a.username,
  'sender_id',i.sender_account_id,'created_at',i.created_at)
  ORDER BY i.created_at DESC),'[]'::jsonb)
 INTO rows FROM public.v21_friend_invitations i
 JOIN public.v21_accounts a ON a.id=i.sender_account_id
 WHERE i.recipient_admin_id=me AND i.status='pending'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL;
 RETURN rows;
END;$$;
REVOKE ALL ON FUNCTION public.v21_friend_invitations_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_friend_invitations_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v21_friend_invitation_respond(
 p_app_session_id uuid,p_invitation_id uuid,p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,v21_private,pg_temp AS $$
DECLARE me uuid; invite public.v21_friend_invitations%rowtype;
BEGIN
 me:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts WHERE id=me
  AND role='admin' AND deleted_at IS NULL AND locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 SELECT * INTO invite FROM public.v21_friend_invitations
  WHERE id=p_invitation_id AND recipient_admin_id=me FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status','not_found'); END IF;
 IF invite.status<>'pending' THEN
   RETURN jsonb_build_object('ok',true,'status',invite.status,'already_handled',true);
 END IF;
 IF p_accept THEN
  UPDATE public.v21_accounts SET contact_group='friend'
  WHERE id=invite.sender_account_id AND role='user'
   AND deleted_at IS NULL AND locked_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'status','account_unavailable'); END IF;
 END IF;
 UPDATE public.v21_friend_invitations
 SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
  responded_at=now() WHERE id=invite.id;
 RETURN jsonb_build_object('ok',true,'status',
  CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
  'account_id',invite.sender_account_id,'account_already_exists',true);
END;$$;
REVOKE ALL ON FUNCTION public.v21_friend_invitation_respond(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v21_friend_invitation_respond(uuid,uuid,boolean) TO authenticated;
