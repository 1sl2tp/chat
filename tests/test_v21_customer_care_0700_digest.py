from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/'supabase/migrations/20261015065000_customer_care_0700_two_day_digest.sql').read_text('utf-8')
LOW=''.join(SQL.lower().split())

# Latest migration supersedes older 5-minute daytime care migration.
assert "'55 23 * * *'" in SQL  # 06:55 Vietnam, for next local date.
assert "'* 0 * * *'" in SQL    # 07:00–07:59 Vietnam.
assert "time'07:00'" in LOW and "time'08:00'" in LOW
assert "interval'1minute'" in LOW
assert "interval'60seconds'" in LOW
assert "'stagger_minutes',1" in LOW
assert "'daily_stagger_capacity',60" in LOW
assert "a.contact_group='customer'" in LOW
assert "a.role='user'" in LOW
assert "pg_try_advisory_xact_lock" in LOW
assert "forupdateofdskiplocked" in LOW
assert "care:auto:" in LOW
assert "chat_customer_care_recent_sales" in LOW
assert "v_suggestions:=public.chat_customer_care_recent_sales(p_date)" in LOW
assert "'recent_sales_2d'" in LOW
assert "o.status='delivered'" in LOW
assert "groupbyi.product_code" in LOW
assert "chat-customer-care-afternoon" in SQL # removed from cron.
assert "select public.chat_customer_care_refresh(now());" not in SQL
assert "select public.chat_customer_care_send_due();" in SQL
assert "no_recent_sales" in LOW

print("KH care 07:00 two-day digest contract PASS")
