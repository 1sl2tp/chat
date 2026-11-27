#!/usr/bin/env bash
# Isolated synthetic PostgreSQL only. No production credentials or endpoints.
set -euo pipefail
cd "$(dirname "$0")"
work="$(mktemp -d)"
cid=""
cleanup() { if [[ -n "$cid" ]]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; rm -rf "$work"; }
trap cleanup EXIT
cid="$(docker run --detach --rm --network none -e POSTGRES_PASSWORD=fixture-only postgres:16.11)"
pg() { docker exec -i "$cid" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
for i in $(seq 1 60); do
 if docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec "$cid" pg_isready -U postgres >/dev/null
pg <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema v0_private;
grant usage on schema v0_private to authenticated;
create function v0_private.admin_read(text,uuid) returns jsonb
language plpgsql stable set search_path='' as $$
begin
 if current_setting('fixture.role',true) is distinct from 'admin' then
  raise exception 'admin_required' using errcode='42501';
 end if;
 return '{"role":"admin"}'::jsonb;
end;
$$;
SQL
pg < quota-candidate.sql
pg < quota.test.sql
pg -Atc "select not has_function_privilege('anon','public.v0_bill_reader_root02_reserve()','EXECUTE') and has_function_privilege('authenticated','public.v0_bill_reader_root02_reserve()','EXECUTE') and not has_table_privilege('authenticated','v0_private.bill_reader_root02_quota','INSERT,UPDATE,SELECT') and not (select prosecdef from pg_proc where oid='public.v0_bill_reader_root02_reserve()'::regprocedure)" | grep -qx t
if pg -c "set role anon; select public.v0_bill_reader_root02_reserve()" >"$work/anon" 2>&1; then echo "anon bypass"; exit 1; fi
if pg -c "set role authenticated; set fixture.role='user'; select public.v0_bill_reader_root02_reserve()" >"$work/user" 2>&1; then echo "non-admin bypass"; exit 1; fi
if pg -c "set role authenticated; select * from v0_private.bill_reader_root02_quota" >"$work/table" 2>&1; then echo "direct table access"; exit 1; fi
race() {
 local pids=()
 for i in $(seq 1 8); do
  ( pg -qAtc "set role authenticated; set fixture.role='admin'; select public.v0_bill_reader_root02_reserve()" >"$work/req-$i" ) &
  pids+=("$!")
 done
 for pid in "${pids[@]}"; do wait "$pid"; done
 test "$(grep -hxc t "$work"/req-* | awk '{s+=$1}END{print s}')" = 1
 test "$(grep -hxc f "$work"/req-* | awk '{s+=$1}END{print s}')" = 7
}
race
pg -Atc "select calls from v0_private.bill_reader_root02_quota" | grep -qx 1
pg -c "update v0_private.bill_reader_root02_quota set calls=29,last_at=clock_timestamp()-interval '11 seconds'"
race
pg -Atc "select calls from v0_private.bill_reader_root02_quota" | grep -qx 30
pg -qAtc "set role authenticated; set fixture.role='admin'; select public.v0_bill_reader_root02_reserve()" | grep -qx f
echo "Quota concurrency: 2 x 8 callers; exactly one grant each. Role and cap checks passed."
