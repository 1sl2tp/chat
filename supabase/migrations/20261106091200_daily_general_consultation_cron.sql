-- 09:00 Asia/Ho_Chi_Minh = 02:00 GMT; project cron timezone is GMT.
-- Recheck every five minutes to 09:25, daily client_id prevents duplicate sends.
select cron.schedule(
 'taphoa-daily-advisory-0900-vn',
 '*/5 2 * * *',
 $cron$select v21_private.taphoa_daily_consultation_dispatch(false,now());$cron$
);