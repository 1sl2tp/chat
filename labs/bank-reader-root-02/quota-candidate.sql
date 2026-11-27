-- Candidate only. Not applied by PR or migration automation.
-- No financial records, OCR results, image keys or customer data.
begin;
create table if not exists v0_private.bill_reader_root02_quota(
 singleton boolean primary key check(singleton),
 bucket_date date not null,
 calls integer not null check(calls between 0 and 30),
 last_at timestamptz not null
);
alter table v0_private.bill_reader_root02_quota enable row level security;
revoke all on v0_private.bill_reader_root02_quota from public,anon,authenticated;
create or replace function v0_private.bill_reader_root02_reserve()
returns boolean language plpgsql volatile security definer set search_path=''
as $$
declare actor jsonb; day_key date; accepted boolean; stamp timestamptz;
begin
 actor:=v0_private.admin_read('session',null);
 if actor->>'role' is distinct from 'admin' then
   raise exception 'admin_required' using errcode='42501';
 end if;
 stamp:=clock_timestamp();
 day_key:=(stamp at time zone 'Asia/Ho_Chi_Minh')::date;
 -- One singleton row: serialized grants across concurrent callers and midnight.
 insert into v0_private.bill_reader_root02_quota as q(singleton,bucket_date,calls,last_at)
 values(true,day_key,1,stamp)
 on conflict(singleton) do update set bucket_date=excluded.bucket_date,
 calls=case when q.bucket_date=excluded.bucket_date then q.calls+1 else 1 end,
 last_at=excluded.last_at
 where excluded.last_at>=q.last_at+interval '10 seconds'
 and excluded.bucket_date>=q.bucket_date
 and (excluded.bucket_date>q.bucket_date or q.calls<30)
 returning true into accepted;
 return coalesce(accepted,false);
end;
$$;
revoke all on function v0_private.bill_reader_root02_reserve() from public,anon,authenticated;
grant execute on function v0_private.bill_reader_root02_reserve() to authenticated;
create or replace function public.v0_bill_reader_root02_reserve()
returns boolean language sql volatile security invoker set search_path=''
as $$ select v0_private.bill_reader_root02_reserve() $$;
revoke all on function public.v0_bill_reader_root02_reserve() from public,anon,authenticated;
grant execute on function public.v0_bill_reader_root02_reserve() to authenticated;
commit;
