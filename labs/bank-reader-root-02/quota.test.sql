begin;
create temporary table root02_quota_fixture(singleton boolean primary key check(singleton),bucket_date date not null,calls integer not null check(calls between 0 and 30),last_at timestamptz not null);
do $$
declare stamp timestamptz; day_key date; accepted boolean; n integer:=0; c record;
begin
 for c in
 select * from (
   select 1 ord,'2026-11-27 23:59:55+07'::timestamptz ts,true want
   union all select 2,'2026-11-28 00:00:00+07'::timestamptz,false
   union all select 3,'2026-11-28 00:00:05+07'::timestamptz,true
   union all select 4,'2026-11-28 00:00:05+07'::timestamptz,false
   union all select 5,'2026-11-27 23:59:00+07'::timestamptz,false
   union all select 5+i,'2026-11-28 00:00:05+07'::timestamptz+i*interval '10 seconds',i<=29 from generate_series(1,30) i
 ) x order by ord
 loop
   stamp:=c.ts; day_key:=(stamp at time zone 'Asia/Ho_Chi_Minh')::date; accepted:=null;
   insert into root02_quota_fixture as q(singleton,bucket_date,calls,last_at)
   values(true,day_key,1,stamp)
   on conflict(singleton) do update set bucket_date=excluded.bucket_date,
   calls=case when q.bucket_date=excluded.bucket_date then q.calls+1 else 1 end,
   last_at=excluded.last_at
   where excluded.last_at>=q.last_at+interval '10 seconds'
   and excluded.bucket_date>=q.bucket_date
   and (excluded.bucket_date>q.bucket_date or q.calls<30)
   returning true into accepted;
   if coalesce(accepted,false) is distinct from c.want then raise exception 'quota fixture failed: %',c.ord;end if;
   n:=n+1;
 end loop;
 if n<>35 or (select calls from root02_quota_fixture)<>30 then raise exception 'count mismatch';end if;
end $$;
select '35/35 synthetic quota scenarios passed' result,calls,bucket_date from root02_quota_fixture;
rollback;