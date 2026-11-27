-- Candidate only. Not applied by PR or migration automation.
-- Private counters contain no OCR results, image keys, bank or ledger data.
begin;
create table if not exists v0_private.bill_reader_root02_quota(
 bucket_date date primary key,
 calls integer not null check(calls between 0 and 30),
 last_at timestamptz not null
);
alter table v0_private.bill_reader_root02_quota enable row level security;
revoke all on v0_private.bill_reader_root02_quota from public,anon,authenticated;
create or replace function public.v0_bill_reader_root02_reserve()
returns boolean language plpgsql volatile security definer set search_path=''
as $$
declare actor jsonb; day_key date; accepted boolean;
begin
 actor:=v0_private.admin_read('session',null);
 if actor->>'role' is distinct from 'admin' then
   raise exception 'admin_required' using errcode='42501';
 end if;
 day_key:=(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
 -- INSERT/UPDATE is atomic across all instances. At most one grant per 10s,
 -- at most 30 per VN day, including failed downstream provider calls.
 insert into v0_private.bill_reader_root02_quota as q(bucket_date,calls,last_at)
 values(day_key,1,clock_timestamp())
 on conflict(bucket_date) do update set calls=q.calls+1,last_at=clock_timestamp()
 where q.calls<30 and q.last_at<=clock_timestamp()-interval '10 seconds'
 returning true into accepted;
 return coalesce(accepted,false);
end;
$$;
revoke all on function public.v0_bill_reader_root02_reserve() from public,anon,authenticated;
grant execute on function public.v0_bill_reader_root02_reserve() to authenticated;
commit;
