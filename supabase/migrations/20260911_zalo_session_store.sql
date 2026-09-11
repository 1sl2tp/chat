create table if not exists public.v21_zalo_bridge_auth (
  id text primary key,
  token_sha256 text not null,
  updated_at timestamptz not null default now(),
  constraint v21_zalo_bridge_auth_primary_only check (id = 'primary')
);

create table if not exists public.v21_zalo_bridge_session (
  id text primary key,
  credentials jsonb,
  updated_at timestamptz not null default now(),
  constraint v21_zalo_bridge_session_primary_only check (id = 'primary')
);

alter table public.v21_zalo_bridge_auth enable row level security;
alter table public.v21_zalo_bridge_session enable row level security;

revoke all on table public.v21_zalo_bridge_auth from anon, authenticated;
revoke all on table public.v21_zalo_bridge_session from anon, authenticated;

grant select on table public.v21_zalo_bridge_auth to service_role;
grant select, insert, update on table public.v21_zalo_bridge_session to service_role;

insert into public.v21_zalo_bridge_auth (id, token_sha256)
values ('primary', 'fa9f86becd2ebbbfdc276afc0578f6906c98da8f5e4d7c402db0a5749f2d38f8')
on conflict (id) do update
set token_sha256 = excluded.token_sha256,
    updated_at = now();
