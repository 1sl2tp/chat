create table if not exists public.v21_customer_public_links (
  customer_account_id uuid primary key references public.v21_accounts(id) on delete cascade,
  access_key text not null unique check (access_key ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.v21_customer_public_links enable row level security;
revoke all on table public.v21_customer_public_links from public, anon, authenticated;

alter table public.chat_quote_snapshots
  add column if not exists customer_account_id uuid references public.v21_accounts(id) on delete cascade;

create index if not exists chat_quote_snapshots_customer_latest_idx
  on public.chat_quote_snapshots(customer_account_id, created_at desc)
  where revoked_at is null and customer_account_id is not null;

create or replace function public.v21_customer_public_link_get_or_create(p_customer_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if p_customer_id is null then raise exception 'customer_required'; end if;
  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;

  select l.access_key into v_key
  from public.v21_customer_public_links l
  where l.customer_account_id=p_customer_id and l.revoked_at is null;
  if v_key is not null then return v_key; end if;

  loop
    v_key := translate(trim(trailing '=' from encode(gen_random_bytes(12),'base64')),'+/','-_');
    begin
      insert into public.v21_customer_public_links(customer_account_id,access_key,revoked_at,updated_at)
      values(p_customer_id,v_key,null,now())
      on conflict(customer_account_id)
      do update set
        access_key=case when public.v21_customer_public_links.revoked_at is null
          then public.v21_customer_public_links.access_key else excluded.access_key end,
        revoked_at=null,updated_at=now()
      returning access_key into v_key;
      return v_key;
    exception when unique_violation then
    end;
  end loop;
end;
$$;

revoke all on function public.v21_customer_public_link_get_or_create(uuid) from public, anon, authenticated;
grant execute on function public.v21_customer_public_link_get_or_create(uuid) to service_role;
