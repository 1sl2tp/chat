-- Dispatch at 06:00 Vietnam Monday and Friday (23:00 GMT Sunday and Thursday).
-- Retry the enqueue check every five minutes for 30 minutes; the sender's
-- calendar-day client_id is unique so retries cannot create duplicate messages.
-- Supabase cron timezone is GMT on this project.
select cron.schedule(
  'taphoa-milk-advisory-0600-vn',
  '*/5 23 * * 0,4',
  $cron$select v21_private.taphoa_milk_consultation_dispatch(false,now());$cron$
);