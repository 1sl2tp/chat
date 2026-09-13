-- Push an Admin notification when a guest actually joins a short-lived call link.
-- Reuses the existing Admin Web Push delivery/wake pipeline.

create table if not exists public.v21_call_invite_push_outbox(
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique references public.chat_call_invites(id) on delete cascade,
  recipient_account_id uuid not null references public.v21_accounts(id) on delete cascade,
  contact_id text not null,
  state text not null default 'pending' check(state in('pending','processing','sent','retry','dead')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v21_call_invite_push_due_idx
  on public.v21_call_invite_push_outbox(state,available_at,created_at);

alter table public.v21_call_invite_push_outbox enable row level security;
revoke all on table public.v21_call_invite_push_outbox from public,anon,authenticated;
grant select,insert,update,delete on table public.v21_call_invite_push_outbox to service_role;

create or replace function v21_private.enqueue_call_invite_push()
returns trigger
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_admin_account_id uuid;
begin
  if old.guest_joined_at is not null or new.guest_joined_at is null then return new; end if;
  if new.admin_joined_at is not null or new.revoked_at is not null or new.ended_at is not null then return new; end if;
  if new.expires_at<=now() then return new; end if;

  select a.id into v_admin_account_id
  from public.v21_accounts a
  where a.auth_user_id=new.created_by_account_id
    and a.role='admin'
    and a.deleted_at is null
    and a.locked_at is null
  limit 1;

  if v_admin_account_id is null then return new; end if;

  insert into public.v21_call_invite_push_outbox(
    invite_id,recipient_account_id,contact_id,state,available_at
  ) values(
    new.id,v_admin_account_id,new.contact_id,'pending',now()
  ) on conflict(invite_id) do nothing;

  return new;
exception when others then
  -- Push is secondary delivery and must never block the canonical invite update.
  return new;
end;
$$;

revoke all on function v21_private.enqueue_call_invite_push() from public;

drop trigger if exists v21_call_invite_push_enqueue_trg on public.chat_call_invites;
create trigger v21_call_invite_push_enqueue_trg
after update of guest_joined_at on public.chat_call_invites
for each row
when (old.guest_joined_at is null and new.guest_joined_at is not null)
execute function v21_private.enqueue_call_invite_push();

create or replace function public.v21_call_invite_push_claim(
  p_limit integer default 20
) returns table(
  outbox_id uuid,
  invite_id uuid,
  recipient_account_id uuid,
  contact_id text,
  attempt_count integer
)
language sql
security definer
set search_path to 'public','v21_private','auth'
as $$
  with due as (
    select o.id
    from public.v21_call_invite_push_outbox o
    where o.state in('pending','retry')
      and o.available_at<=now()
    order by o.created_at,o.id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  ), claimed as (
    update public.v21_call_invite_push_outbox o
    set state='processing',
        attempt_count=o.attempt_count+1,
        updated_at=now()
    from due
    where o.id=due.id
    returning o.id,o.invite_id,o.recipient_account_id,o.contact_id,o.attempt_count
  )
  select id,invite_id,recipient_account_id,contact_id,attempt_count
  from claimed;
$$;

create or replace function public.v21_call_invite_push_result(
  p_outbox_id uuid,
  p_ok boolean,
  p_error text,
  p_dead boolean
) returns boolean
language plpgsql
security definer
set search_path to 'public','v21_private','auth'
as $$
declare
  v_attempt integer;
  v_updated integer;
begin
  select o.attempt_count into v_attempt
  from public.v21_call_invite_push_outbox o
  where o.id=p_outbox_id
  for update;
  if v_attempt is null then return false; end if;

  update public.v21_call_invite_push_outbox o
  set state=case
        when coalesce(p_ok,false) then 'sent'
        when coalesce(p_dead,false) or v_attempt>=5 then 'dead'
        else 'retry'
      end,
      available_at=case
        when coalesce(p_ok,false) or coalesce(p_dead,false) or v_attempt>=5 then now()
        else now()+make_interval(secs=>least(300,10*power(2,greatest(0,v_attempt-1))::integer))
      end,
      last_error=case when coalesce(p_ok,false) then null else left(coalesce(p_error,'push_failed'),1000) end,
      updated_at=now()
  where o.id=p_outbox_id and o.state='processing';
  get diagnostics v_updated=row_count;
  return v_updated=1;
end;
$$;

revoke all on function public.v21_call_invite_push_claim(integer) from public,anon,authenticated;
revoke all on function public.v21_call_invite_push_result(uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.v21_call_invite_push_claim(integer) to service_role;
grant execute on function public.v21_call_invite_push_result(uuid,boolean,text,boolean) to service_role;

-- Reuse the same wake function that already drains normal Admin message pushes.
drop trigger if exists v21_call_invite_push_signal_trg on public.v21_call_invite_push_outbox;
create trigger v21_call_invite_push_signal_trg
after insert on public.v21_call_invite_push_outbox
for each row
when (new.state='pending')
execute function v21_private.admin_push_signal();
