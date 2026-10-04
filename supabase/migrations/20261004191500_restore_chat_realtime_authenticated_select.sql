-- Restore Realtime table privileges after the Supabase project cutover.
-- RLS remains the authorization owner; authenticated only gets SELECT.
grant select on table
  public.v21_sync_events,
  public.v21_messages,
  public.v21_session_events
to authenticated;

revoke all on table
  public.v21_sync_events,
  public.v21_messages,
  public.v21_session_events
from anon;
