-- Resource guardrail: Render Free sleeps after inactivity, but a 10-minute
-- health request is sufficient to keep the Zalo bridge warm while halving the
-- previous keepalive traffic.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='v21-zalo-bridge-keepalive'
  order by jobid desc
  limit 1;

  if v_jobid is not null then
    perform cron.alter_job(
      job_id := v_jobid,
      schedule := '*/10 * * * *'
    );
  end if;
end
$$;
