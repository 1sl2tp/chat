from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "supabase/migrations/20260922225500_customer_care_schedule.sql"
ROUTE = ROOT / "supabase/migrations/20261004194500_restore_customer_care_milk_route_days.sql"
TEMPLATES = ROOT / "supabase/migrations/20261004195500_customer_care_professional_templates.sql"
AUTO = ROOT / "supabase/migrations/20261004201000_customer_care_auto_send_kh_safe_pacing.sql"

for path in (BASE,ROUTE,TEMPLATES,AUTO):
    assert path.exists(), path

base_sql=BASE.read_text("utf-8")
route_sql=ROUTE.read_text("utf-8")
templates_sql=TEMPLATES.read_text("utf-8")
auto_sql=AUTO.read_text("utf-8")
route_low=route_sql.lower()
route_compact="".join(route_low.split())
auto_low=auto_sql.lower()
auto_compact="".join(auto_low.split())

# Final route: Monday + Friday are Milk; every other day is regular goods.
assert "in(1,5)" in route_compact
assert "'source_key','sua'" in route_compact
assert "'source_key','hang-thuong'" in route_compact
assert "when1then'thứ2'" in route_compact
assert "else'thứ6'" in route_compact

# Scanner runs ahead of the automatic sender.
assert "'15 2 * * *'" in base_sql
assert "'0 7 * * *'" in base_sql

# Auto care is KH-only. Friend/other groups are never eligible.
assert "a.contact_group='customer'" in auto_compact
assert "a.role='user'" in auto_compact

# Conservative business-hour pacing: one cron pass every 5 minutes,
# morning + afternoon only, no lunch/night burst.
assert "interval'5minutes'" in auto_compact
assert "time'09:35'" in auto_compact
assert "time'14:20'" in auto_compact
assert "09:30–11:35" in auto_sql
assert "14:15–17:35" in auto_sql
assert "'*/52-4,7-10***'" in auto_compact
assert "'stagger_minutes',5" in auto_compact
assert "'auto_send',true" in auto_compact
assert "'send_mode','auto_safe_staggered'" in auto_compact

# Only one sender owner and one candidate per pass.
assert "pg_try_advisory_xact_lock" in auto_low
assert "forupdateof d skiplocked" in auto_compact
assert "limit1" in auto_compact
assert "jobname='chat-customer-care-auto-send'" in auto_compact

# Zalo/recipient safety guards.
assert "z.statein('pending','sending','retry','retrying')" in auto_compact
assert "interval'2minutes'" in auto_compact
assert "interval'4minutes30seconds'" in auto_compact
assert "interval'60minutes'" in auto_compact

# One customer/day and idempotent message creation through the canonical notifier.
assert "primary key (business_date, customer_id)" in base_sql.lower()
assert "d.contacted_atisnull" in auto_compact
assert "'care:auto:'" in auto_low
assert "taphoa_chat_notify_customer" in auto_low
assert "setcontacted_at=coalesce(contacted_at,now())" in auto_compact

# Professional templates remain the canonical message body owner.
assert "chat_customer_care_message" in auto_low
assert "'reason','customer_history'" in "".join(templates_sql.lower().split())
assert "'reason','market'" in "".join(templates_sql.lower().split())
assert "'reason','catalog'" in "".join(templates_sql.lower().split())

print("Customer care KH-only auto-send safe pacing contract PASS")
