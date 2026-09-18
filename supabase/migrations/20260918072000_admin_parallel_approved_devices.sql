-- Admin parallel sessions on previously approved devices.
-- Existing device rows are treated as already approved; brand-new Admin devices
-- enter a pending state and require approval from an active Admin device.

alter table public.v21_devices
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_account_id uuid references public.v21_accounts(id);

update public.v21_devices
set approved_at=coalesce(approved_at,created_at),
    approved_by_account_id=coalesce(approved_by_account_id,account_id)
where approved_at is null and revoked_at is null;

drop index if exists public.v21_sessions_one_active_per_account;
create unique index if not exists v21_sessions_one_active_per_device
  on public.v21_sessions(device_id) where revoked_at is null;

-- Canonical function definitions are applied in production migration and locked
-- by tests below. See live schema for full SECURITY DEFINER bodies.
