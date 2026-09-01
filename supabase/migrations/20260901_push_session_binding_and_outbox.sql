alter table public.chat_call_push_subscriptions
  add column if not exists auth_session_id uuid null;

with valid_session as (
  select
    s.device_id,
    min(s.auth_session_id::text)::uuid as auth_session_id
  from public.chat_sessions s
  join public.chat_devices d
    on d.id = s.device_id
   and d.profile_id = s.profile_id
   and d.revoked_at is null
  join public.chat_profiles p
    on p.id = s.profile_id
  join auth.sessions a
    on a.id = s.auth_session_id
   and a.user_id = p.auth_user_id
   and (a.not_after is null or a.not_after > now())
  where s.revoked_at is null
  group by s.device_id
  having count(*) = 1
)
update public.chat_call_push_subscriptions ps
set auth_session_id = v.auth_session_id,
    updated_at = now()
from valid_session v
where v.device_id = ps.device_id
  and ps.auth_session_id is null;

delete from public.chat_call_push_subscriptions
where auth_session_id is null;

alter table public.chat_call_push_subscriptions
  alter column auth_session_id set not null;

alter table public.chat_call_push_subscriptions
  drop constraint if exists chat_call_push_subscriptions_auth_session_id_fkey;

alter table public.chat_call_push_subscriptions
  add constraint chat_call_push_subscriptions_auth_session_id_fkey
  foreign key (auth_session_id)
  references public.chat_sessions(auth_session_id)
  on delete cascade;

create or replace function public.chat_upsert_call_push_subscription(
  p_device_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'chat_private'
as $function$
declare
  v_actor uuid := public.chat_current_profile_id();
  v_session uuid := public.chat_current_session_id();
begin
  if v_actor is null or v_session is null then raise exception 'session_revoked'; end if;
  if p_device_id is null or not chat_private.device_belongs_to_profile(p_device_id, v_actor) then
    raise exception 'invalid_device';
  end if;
  if p_endpoint is null or length(p_endpoint) < 20 or length(p_endpoint) > 4096 or p_endpoint !~ '^https://' then
    raise exception 'invalid_push_endpoint';
  end if;
  if p_p256dh is null or length(p_p256dh) < 20 or length(p_p256dh) > 512 or p_p256dh !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid_push_p256dh';
  end if;
  if p_auth is null or length(p_auth) < 8 or length(p_auth) > 256 or p_auth !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid_push_auth';
  end if;

  delete from public.chat_call_push_subscriptions
  where endpoint = p_endpoint
    and (
      profile_id <> v_actor
      or device_id <> p_device_id
      or auth_session_id <> v_session
    );

  insert into public.chat_call_push_subscriptions(
    profile_id,
    device_id,
    auth_session_id,
    endpoint,
    p256dh,
    auth_key
  )
  values(v_actor, p_device_id, v_session, p_endpoint, p_p256dh, p_auth)
  on conflict(device_id) do update
    set profile_id = excluded.profile_id,
        auth_session_id = excluded.auth_session_id,
        endpoint = excluded.endpoint,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        updated_at = now();

  return true;
end;
$function$;

revoke all on function public.chat_upsert_call_push_subscription(uuid, text, text, text) from public, anon;
grant execute on function public.chat_upsert_call_push_subscription(uuid, text, text, text) to authenticated;

create or replace function public.chat_service_push_targets(
  p_profile_id uuid,
  p_device_id uuid default null
)
returns table(
  subscription_id uuid,
  device_id uuid,
  endpoint text,
  p256dh text,
  auth_key text
)
language sql
stable
security definer
set search_path to 'public', 'chat_private', 'auth'
as $function$
  select
    ps.id,
    ps.device_id,
    ps.endpoint,
    ps.p256dh,
    ps.auth_key
  from public.chat_call_push_subscriptions ps
  join public.chat_devices d
    on d.id = ps.device_id
   and d.profile_id = ps.profile_id
   and d.revoked_at is null
  join public.chat_sessions s
    on s.auth_session_id = ps.auth_session_id
   and s.device_id = ps.device_id
   and s.profile_id = ps.profile_id
   and s.revoked_at is null
  join public.chat_profiles p
    on p.id = ps.profile_id
  join auth.sessions a
    on a.id = ps.auth_session_id
   and a.user_id = p.auth_user_id
   and (a.not_after is null or a.not_after > now())
  where ps.profile_id = p_profile_id
    and (p_device_id is null or ps.device_id = p_device_id);
$function$;

revoke all on function public.chat_service_push_targets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chat_service_push_targets(uuid, uuid) to service_role;

create table if not exists public.chat_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('chat_message', 'incoming_call')),
  source_id uuid not null,
  recipient_profile_id uuid not null references public.chat_profiles(id) on delete cascade,
  dispatch_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  processed_at timestamptz null,
  last_error text null,
  unique(event_type, source_id, recipient_profile_id)
);

alter table public.chat_notification_outbox enable row level security;
revoke all on table public.chat_notification_outbox from public, anon, authenticated;
grant select, update on table public.chat_notification_outbox to service_role;

create or replace function chat_private.notification_dispatch_url()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/taphoaxyz-call-push'::text;
$function$;

revoke all on function chat_private.notification_dispatch_url() from public, anon, authenticated;

create or replace function chat_private.enqueue_notification(
  p_event_type text,
  p_source_id uuid,
  p_recipient_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'chat_private', 'net'
as $function$
declare
  v_event_id uuid;
  v_dispatch_token uuid;
begin
  insert into public.chat_notification_outbox(
    event_type,
    source_id,
    recipient_profile_id,
    dispatch_token
  )
  values(
    p_event_type,
    p_source_id,
    p_recipient_profile_id,
    gen_random_uuid()
  )
  on conflict(event_type, source_id, recipient_profile_id) do nothing
  returning id, dispatch_token into v_event_id, v_dispatch_token;

  if v_event_id is null then
    return null;
  end if;

  begin
    perform net.http_post(
      url := chat_private.notification_dispatch_url(),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'action', 'dispatch_event',
        'event_id', v_event_id,
        'dispatch_token', v_dispatch_token
      )
    );
  exception when others then
    update public.chat_notification_outbox
    set last_error = left('dispatch_enqueue_failed:' || sqlerrm, 500)
    where id = v_event_id;
  end;

  return v_event_id;
end;
$function$;

revoke all on function chat_private.enqueue_notification(text, uuid, uuid) from public, anon, authenticated;
