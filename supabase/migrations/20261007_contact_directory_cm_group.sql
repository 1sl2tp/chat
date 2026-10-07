alter table public.v21_accounts
  drop constraint if exists v21_accounts_contact_group_check;

alter table public.v21_accounts
  add constraint v21_accounts_contact_group_check
  check (contact_group = any (array['customer'::text,'friend'::text,'other'::text,'cm'::text]));
