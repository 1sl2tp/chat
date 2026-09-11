alter table public.v21_accounts
  add column if not exists contact_group text not null default 'other';

update public.v21_accounts
set contact_group = 'other'
where contact_group is null
   or contact_group not in ('customer','friend','other');

alter table public.v21_accounts
  drop constraint if exists v21_accounts_contact_group_check;

alter table public.v21_accounts
  add constraint v21_accounts_contact_group_check
  check (contact_group in ('customer','friend','other'));

comment on column public.v21_accounts.contact_group is
  'Admin-managed directory classification: customer, friend, or other.';
