-- Expire stale Zalo outbound rows stranded during the Supabase/Render cutover.
-- Canonical chat messages remain untouched.

update public.zalo_message_links
set state='failed',
    last_error='expired_cutover_pending',
    updated_at=now()
where direction='outbound'
  and state='pending'
  and attempt_count=0
  and created_at < now() - interval '1 hour';
