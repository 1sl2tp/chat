-- Limit checks to 09:00–09:29 Vietnam (02:00–02:29 UTC).
-- Old single-message dispatcher remains disabled by replacing the SAME cron job.
select cron.schedule(
  'taphoa-daily-advisory-0900-vn',
  '0-29 2 * * *',
  $cron$select v21_private.taphoa_daily_advice_send_ordered(now());$cron$
);