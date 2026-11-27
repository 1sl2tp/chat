#!/usr/bin/env bash
# Isolated CI database only. Two real PostgreSQL sessions contend for the same permit.
set -euo pipefail
export PGPASSWORD=fixture
psql_cmd=(psql -h localhost -U postgres -X -qAt -v ON_ERROR_STOP=1)
sql(){ "${psql_cmd[@]}" -c "$1"; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
before=$(sql "select md5(to_jsonb(r)::text) from public.chat_bank_bill_receipts r")
reset(){
 sql "update v0_private.bill_focus_control set mode='pilot'; update v0_private.bill_focused_reread set state=case when field='account' then 'queued' else 'needs_review' end, attempts=0, next_at=now(), lease_id=null, lease_until=null; update v0_private.bill_account_crop_benchmark set state='queued',result=null,lease_id=null,lease_until=null;"
}
run_race(){
 local winner=$1 loser=$2 label=$3
 reset
 PGAPPNAME="root01h-$label" "${psql_cmd[@]}" -c "begin; select ($winner is not null)::int; select pg_sleep(3); commit;" >"$tmp/$label" &
 local pid=$! found=0
 for _ in $(seq 1 40); do
  if [[ $(sql "select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='root01h-$label' and l.locktype='advisory' and l.granted") != 0 ]]; then found=1; break; fi
  sleep 0.05
 done
 [[ $found == 1 ]]
 [[ $(sql "select ($loser is null)::int") == 1 ]]
 wait "$pid"
 grep -qx 1 "$tmp/$label"
 # Lock is released at commit, but the winning live lease still blocks the other queue.
 [[ $(sql "select ($loser is null)::int") == 1 ]]
 [[ $(sql "select (select count(*) from v0_private.bill_focused_reread where state='running' and lease_until>clock_timestamp())+(select count(*) from v0_private.bill_account_crop_benchmark where state='running' and lease_until>clock_timestamp())") == 1 ]]
 # Expired lease no longer owns the permit.
 sql "update v0_private.bill_focused_reread set lease_until=clock_timestamp()-interval '1 second' where state='running'; update v0_private.bill_account_crop_benchmark set lease_until=clock_timestamp()-interval '1 second' where state='running';"
 [[ $(sql "select ($loser is not null)::int") == 1 ]]
 echo "H1 $label: real concurrent claim, committed lease exclusion and expiry passed"
}
run_race 'public.v0_bill_crop_benchmark_claim()' 'public.v0_bill_focus_claim()' benchmark-first
run_race 'public.v0_bill_focus_claim()' 'public.v0_bill_crop_benchmark_claim()' focused-first
sql "update v0_private.bill_focus_control set mode='off'"
[[ $(sql "select (public.v0_bill_focus_claim() is null and public.v0_bill_crop_benchmark_claim() is null)::int") == 1 ]]
[[ $(sql "select (not has_function_privilege('service_role','v0_private.bill_extra_ai_permit(text)','execute') and not has_function_privilege('authenticated','public.v0_bill_focus_claim()','execute'))::int") == 1 ]]
[[ $(sql "select md5(to_jsonb(r)::text) from public.chat_bank_bill_receipts r") == "$before" ]]
echo "H1 mode off, ACL and unchanged receipt passed"
