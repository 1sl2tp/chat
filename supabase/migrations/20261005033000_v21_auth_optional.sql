begin;

-- AUTH-03: account_id is the canonical business identity.
-- Auth is optional and only exists for accounts that deliberately log in.
alter table public.v21_accounts
  alter column auth_user_id drop not null;

comment on column public.v21_accounts.auth_user_id is
  'Optional Supabase Auth identity for login-enabled accounts. Business/contact/customer accounts may exist by account id only; auth_user_id remains unique when present.';

commit;
