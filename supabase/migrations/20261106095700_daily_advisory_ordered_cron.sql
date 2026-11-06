-- Daily advice full text, sequential group delivery, one Zalo ack at a time.
-- Database pg_cron timezone is GMT: 02:00-02:29 GMT = 09:00-09:29 Vietnam.
-- Reuse the existing job name so the legacy one-piece sender is fully replaced.
select cron.schedule(
  'taphoa-daily-advisory-0900-vn',
  '* 2 * * *',
  $cron$select v21_private.taphoa_daily_advice_send_ordered(now());$cron$
);