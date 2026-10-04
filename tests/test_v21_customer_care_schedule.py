from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "supabase/migrations/20260922225500_customer_care_schedule.sql"
POLICY = ROOT / "supabase/migrations/20260922232000_customer_care_pre_delivery_stagger.sql"
ROUTE = ROOT / "supabase/migrations/20261004194500_restore_customer_care_milk_route_days.sql"

assert BASE.exists(), "customer care base schedule migration is missing"
assert POLICY.exists(), "customer care stagger migration is missing"
assert ROUTE.exists(), "customer care final route-day override is missing"

base_sql = BASE.read_text("utf-8")
policy_sql = POLICY.read_text("utf-8")
route_sql = ROUTE.read_text("utf-8")
sql = base_sql + "\n" + policy_sql + "\n" + route_sql
low = sql.lower()
compact = "".join(low.split())
policy_low = policy_sql.lower()
policy_compact = "".join(policy_low.split())
route_low = route_sql.lower()
route_compact = "".join(route_low.split())

# Vietnam time owns the scheduler.
assert "asia/ho_chi_minh" in policy_low

# Final route contract: Monday (1) and Friday (5) are Milk route days.
# Every other day is regular goods. The later migration intentionally
# overrides the historical one-day-early reminder rule.
assert "extract(isodow from p_date)" in route_low
assert "in(1,5)" in route_compact
assert "'source_key','sua'" in route_compact
assert "'source_key','hang-thuong'" in route_compact
assert "'care_reason','route_day'" in route_compact
assert "'care_reason','regular'" in route_compact
assert "'delivery_day'" in route_low
assert "when1then'thứ2'" in route_compact
assert "else'thứ6'" in route_compact

# Three days without a delivered order is already stale.
assert ">= 3" in base_sql
assert "o.status='delivered'" in "".join(base_sql.lower().split())

# Customers without purchase history remain eligible and receive market fallback.
assert "never_purchased" in low
assert "'reason','market'" in low
assert "'reason','customer_history'" in low

# Scanner still runs ahead of the two shopkeeper-friendly send windows.
assert "'15 2 * * *'" in base_sql      # 09:15 Vietnam
assert "'0 7 * * *'" in base_sql       # 14:00 Vietnam
for value in ("09:30", "10:30", "14:15", "15:30"):
    assert value in sql

# Current customer group is staggered rather than placed into one bulk-send moment.
assert "recommended_send_at" in policy_low
assert "interval '2 minutes'" in policy_low
assert "time '09:32'" in policy_low
assert "time '14:17'" in policy_low
assert "'stagger_minutes',2" in policy_compact
assert "'send_mode','manual_staggered'" in policy_compact

# One daily care state per customer. The scheduler plans slots but never auto-sends chat.
assert "primary key (business_date, customer_id)" in base_sql.lower()
assert "'max_contact_per_customer_per_day',1" in policy_compact
assert "'auto_send',false" in policy_compact
assert "taphoa_chat_notify_customer" not in route_low
assert "insert into public.v21_messages" not in route_low

print("Customer care schedule contract PASS")
