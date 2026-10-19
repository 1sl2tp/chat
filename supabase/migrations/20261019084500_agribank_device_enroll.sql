-- Admin-only one-time token issuance. The token itself is never persisted as plaintext.
begin;
create or replace function public.chat_agribank_issue_device_token(p_label text default 'Agribank Plus Android')
returns jsonb language plpgsql security definer
set search_path to 'public','v21_private','pg_temp'
as $fn$
declare
 actor uuid:=v21_private.current_active_account_id();
 secret text;
 device uuid;
 label text;
begin
 if actor is null or not exists (
   select 1 from public.v21_accounts a where a.id=actor and a.role='admin'
     and a.deleted_at is null and a.locked_at is null
 ) then raise exception 'admin_required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(19210620);
 if (select count(*) from public.taphoa_sms_ingest_devices where active)>4 then
    raise exception 'device_limit_reached';
 end if;
 label:=left(btrim(coalesce(p_label,'Agribank Plus Android')),72);
 if length(label)<3 then label:='Agribank Plus Android'; end if;
 secret:=encode(gen_random_bytes(32),'hex');
 insert into public.taphoa_sms_ingest_devices(device_label,key_sha256,active)
 values(label,encode(digest(secret,'sha256'),'hex'),true) returning id into device;
 return jsonb_build_object('ok',true,'device_id',device,'device_token',secret);
end;
$fn$;
revoke all on function public.chat_agribank_issue_device_token(text) from public,anon;
grant execute on function public.chat_agribank_issue_device_token(text) to authenticated;
commit;