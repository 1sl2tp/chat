from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "supabase/migrations/20260922225500_customer_care_schedule.sql"
POLICY = ROOT / "supabase/migrations/20260922232000_customer_care_pre_delivery_stagger.sql"

assert BASE.exists(), "customer care base schedule migration is missing"
assert POLICY.exists(), "customer care pre-delivery stagger migration is missing"

base_sql = BASE.read_text("utf-8")
policy_sql = POLICY.read_text("utf-8")
sql = base_sql + "\n" + policy_sql
low = sql.lower()
compact = "".join(low.split())
policy_low = policy_sql.lower()
policy_compact = "".join(policy_low.split())

# Vietnam time owns the policy.
assert "asia/ho_chi_minh" in policy_low

# Milk is delivered Monday and Friday, so customer care reminds one day earlier:
# Thursday (4) for Friday delivery and Sunday (7) for Monday delivery.
assert "extract(isodow from p_date)" in policy_low
assert "in(4,7)" in policy_compact
assert "'source_key','sua'" in policy_low
assert "'source_key','hang-thuong'" in policy_low
assert "'care_reason','pre_delivery'" in policy_compact
assert "'delivery_day'" in policy_low

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
assert "taphoa_chat_notify_customer" not in policy_low
assert "insert into public.v21_messages" not in policy_low

print("Customer care schedule contract PASS")
