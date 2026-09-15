begin;

alter table public.chat_customer_summary_state
  add column if not exists dirty_version bigint not null default 0,
  add column if not exists processed_version bigint not null default 0,
  add column if not exists claimed_version bigint null,
  add column if not exists claim_started_at timestamptz null;

create index if not exists chat_customer_summary_state_dirty_idx
  on public.chat_customer_summary_state(updated_at,customer_id)
  where dirty_version > processed_version;

create or replace function public.chat_customer_summary_mark_dirty(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public,pg_temp
as $$
begin
  if p_customer_id is null then return; end if;
  if not exists(
    select 1
    from public.v21_accounts a
    where a.id=p_customer_id
      and a.contact_group='customer'
      and a.deleted_at is null
  ) then
    return;
  end if;

  insert into public.chat_customer_summary_state(
    customer_id,dirty_version,processed_version,updated_at
  ) values (
    p_customer_id,1,0,now()
  )
  on conflict on constraint chat_customer_summary_state_pkey do update
    set dirty_version = public.chat_customer_summary_state.dirty_version + 1,
        updated_at = now();
end;
$$;

create or replace function public.chat_customer_summary_message_dirty_trigger()
returns trigger
language plpgsql
security definer
set search_path = public,pg_temp
as $$
begin
  if tg_op='UPDATE' and old.sender_account_id is distinct from new.sender_account_id then
    perform public.chat_customer_summary_mark_dirty(old.sender_account_id);
  end if;
  perform public.chat_customer_summary_mark_dirty(new.sender_account_id);
  return new;
end;
$$;

drop trigger if exists chat_customer_summary_message_dirty on public.v21_messages;
create trigger chat_customer_summary_message_dirty
after insert or update of body,deleted_at,sender_account_id on public.v21_messages
for each row execute function public.chat_customer_summary_message_dirty_trigger();

create or replace function public.chat_customer_summary_media_dirty_trigger()
returns trigger
language plpgsql
security definer
set search_path = public,pg_temp
as $$
begin
  if tg_op='UPDATE' and old.kind='image' then
    perform public.chat_customer_summary_mark_dirty(old.owner_account_id);
  end if;
  if new.kind='image' then
    perform public.chat_customer_summary_mark_dirty(new.owner_account_id);
  end if;
  return new;
end;
$$;

drop trigger if exists chat_customer_summary_media_dirty on public.v21_media_assets;
create trigger chat_customer_summary_media_dirty
after insert or update of deleted_at,message_id,kind,owner_account_id on public.v21_media_assets
for each row execute function public.chat_customer_summary_media_dirty_trigger();

create or replace function public.chat_customer_summary_claim_dirty_batch(p_limit integer default 15)
returns table(customer_id uuid,username text,display_name text,claim_version bigint)
language plpgsql
security definer
set search_path = public,pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('chat_customer_summary_claim_dirty_batch'));

  return query
  with candidates as (
    select s.customer_id,s.dirty_version
    from public.chat_customer_summary_state s
    join public.v21_accounts a on a.id=s.customer_id
    where a.contact_group='customer'
      and a.deleted_at is null
      and s.dirty_version > s.processed_version
      and (
        s.claim_started_at is null
        or s.claim_started_at < now() - interval '3 minutes'
      )
    order by s.updated_at asc,s.customer_id
    limit least(greatest(coalesce(p_limit,15),1),15)
    for update of s skip locked
  ), claimed as (
    update public.chat_customer_summary_state s
    set claimed_version=c.dirty_version,
        claim_started_at=now(),
        last_scanned_at=now()
    from candidates c
    where s.customer_id=c.customer_id
    returning s.customer_id,s.claimed_version
  )
  select c.customer_id,a.username,a.display_name,c.claimed_version
  from claimed c
  join public.v21_accounts a on a.id=c.customer_id
  order by c.customer_id
  limit 15;
end;
$$;

create or replace function public.chat_customer_summary_finish_success(
  p_customer_id uuid,
  p_claim_version bigint,
  p_run_id uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public,pg_temp
as $$
declare
  changed integer := 0;
begin
  update public.chat_customer_summary_state s
  set last_run_id=p_run_id,
      last_result=coalesce(p_result,'{"items":[],"notes":[]}'::jsonb),
      last_error=null,
      processed_version=greatest(s.processed_version,p_claim_version),
      claimed_version=null,
      claim_started_at=null,
      last_scanned_at=now(),
      updated_at=now()
  where s.customer_id=p_customer_id
    and s.claimed_version=p_claim_version;
  get diagnostics changed = row_count;
  return changed=1;
end;
$$;

create or replace function public.chat_customer_summary_finish_failure(
  p_customer_id uuid,
  p_claim_version bigint,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public,pg_temp
as $$
declare
  changed integer := 0;
begin
  update public.chat_customer_summary_state s
  set last_error=left(coalesce(p_error,'scan_failed'),200),
      claimed_version=null,
      claim_started_at=null,
      last_scanned_at=now(),
      updated_at=now()
  where s.customer_id=p_customer_id
    and s.claimed_version=p_claim_version;
  get diagnostics changed = row_count;
  return changed=1;
end;
$$;

-- Seed only customers whose source changed after their last successful result.
-- This catches messages/images that arrived just before this migration, without
-- forcing a full rescan of customers whose source has not changed.
with source_change as (
  select a.id as customer_id,
         greatest(
           coalesce((
             select max(greatest(m.created_at,m.updated_at))
             from public.v21_messages m
             where m.sender_account_id=a.id
           ),'-infinity'::timestamptz),
           coalesce((
             select max(greatest(ma.created_at,ma.updated_at))
             from public.v21_media_assets ma
             where ma.owner_account_id=a.id
               and ma.kind='image'
           ),'-infinity'::timestamptz)
         ) as changed_at
  from public.v21_accounts a
  where a.contact_group='customer'
    and a.deleted_at is null
), last_success as (
  select s.customer_id,
         coalesce(r.finished_at,'-infinity'::timestamptz) as finished_at
  from public.chat_customer_summary_state s
  left join public.chat_customer_summary_runs r on r.id=s.last_run_id
), needs_dirty as (
  select sc.customer_id
  from source_change sc
  left join last_success ls on ls.customer_id=sc.customer_id
  where sc.changed_at > coalesce(ls.finished_at,'-infinity'::timestamptz)
)
insert into public.chat_customer_summary_state(
  customer_id,dirty_version,processed_version,updated_at
)
select nd.customer_id,1,0,now()
from needs_dirty nd
on conflict on constraint chat_customer_summary_state_pkey do update
  set dirty_version = case
        when public.chat_customer_summary_state.dirty_version > public.chat_customer_summary_state.processed_version
          then public.chat_customer_summary_state.dirty_version
        else public.chat_customer_summary_state.processed_version + 1
      end,
      updated_at=now();

revoke all on function public.chat_customer_summary_mark_dirty(uuid) from public,anon,authenticated;
revoke all on function public.chat_customer_summary_claim_dirty_batch(integer) from public,anon,authenticated;
revoke all on function public.chat_customer_summary_finish_success(uuid,bigint,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.chat_customer_summary_finish_failure(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.chat_customer_summary_mark_dirty(uuid) to service_role;
grant execute on function public.chat_customer_summary_claim_dirty_batch(integer) to service_role;
grant execute on function public.chat_customer_summary_finish_success(uuid,bigint,uuid,jsonb) to service_role;
grant execute on function public.chat_customer_summary_finish_failure(uuid,bigint,text) to service_role;

commit;
