alter table public.v21_customer_public_links
  add column if not exists public_slug text;

create unique index if not exists v21_customer_public_links_public_slug_key
  on public.v21_customer_public_links(public_slug)
  where public_slug is not null;

create or replace function public.v21_customer_public_slug_base(p_value text)
returns text
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select left(
    coalesce(
      nullif(
        trim(both '-' from regexp_replace(
          lower(extensions.unaccent(coalesce(p_value,''))),
          '[^a-z0-9]+','-','g'
        )),
        ''
      ),
      'khach-hang'
    ),
    56
  );
$$;

revoke all on function public.v21_customer_public_slug_base(text) from public, anon, authenticated;

update public.v21_customer_public_links l
set public_slug =
  public.v21_customer_public_slug_base(coalesce(nullif(a.display_name,''),nullif(a.username,''),'khach-hang'))
  || '-' || lower(substr(l.access_key,1,5))
from public.v21_accounts a
where a.id=l.customer_account_id
  and (l.public_slug is null or btrim(l.public_slug)='');

alter table public.v21_customer_public_links
  add constraint v21_customer_public_links_public_slug_check
  check (
    public_slug is null
    or (
      char_length(public_slug) between 3 and 80
      and public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  ) not valid;

alter table public.v21_customer_public_links
  validate constraint v21_customer_public_links_public_slug_check;

create or replace function public.v21_customer_public_link_info_get_or_create(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_slug text;
  v_base text;
  v_name text;
  v_revoked timestamptz;
begin
  if p_customer_id is null then raise exception 'customer_required'; end if;

  select coalesce(nullif(a.display_name,''),nullif(a.username,''),'Khách hàng')
  into v_name
  from public.v21_accounts a
  where a.id=p_customer_id
    and a.role='user'
    and a.contact_group='customer'
    and a.deleted_at is null
    and a.locked_at is null;

  if v_name is null then raise exception 'customer_not_found'; end if;

  v_base := public.v21_customer_public_slug_base(v_name);

  select l.access_key,l.public_slug,l.revoked_at
  into v_key,v_slug,v_revoked
  from public.v21_customer_public_links l
  where l.customer_account_id=p_customer_id
  for update;

  if found and v_revoked is null then
    if v_slug is null or btrim(v_slug)='' then
      v_slug := v_base || '-' || lower(substr(v_key,1,5));
      update public.v21_customer_public_links
      set public_slug=v_slug,updated_at=now()
      where customer_account_id=p_customer_id;
    end if;
    return jsonb_build_object('access_key',v_key,'public_slug',v_slug);
  end if;

  loop
    v_key := translate(trim(trailing '=' from encode(gen_random_bytes(12),'base64')),'+/','-_');
    v_slug := v_base || '-' || lower(substr(v_key,1,5));
    begin
      insert into public.v21_customer_public_links(
        customer_account_id,access_key,public_slug,revoked_at,updated_at
      )
      values(p_customer_id,v_key,v_slug,null,now())
      on conflict(customer_account_id)
      do update set
        access_key=excluded.access_key,
        public_slug=excluded.public_slug,
        revoked_at=null,
        updated_at=now()
      returning access_key,public_slug into v_key,v_slug;

      return jsonb_build_object('access_key',v_key,'public_slug',v_slug);
    exception when unique_violation then
    end;
  end loop;
end;
$$;

revoke all on function public.v21_customer_public_link_info_get_or_create(uuid) from public, anon, authenticated;
grant execute on function public.v21_customer_public_link_info_get_or_create(uuid) to service_role;
