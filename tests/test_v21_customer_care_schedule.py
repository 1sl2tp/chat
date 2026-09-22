from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260922225500_customer_care_schedule.sql"

assert MIGRATION.exists(), "customer care schedule migration is missing"
sql = MIGRATION.read_text("utf-8")
low = sql.lower()
compact = "".join(low.split())

# Vietnam time owns the policy.
assert "asia/ho_chi_minh" in low

# Monday (1) and Friday (5) are milk; every other day is regular goods.
assert "extract(isodow from p_date)" in low
assert "in (1,5)" in compact
assert "'source_key','sua'" in low
assert "'source_key','hang-thuong'" in low

# Three days without a delivered order is already stale.
assert ">= 3" in sql
assert "o.status='delivered'" in compact

# Customers without purchase history remain eligible and receive market fallback.
assert "never_purchased" in low
assert "'reason','market'" in low
assert "'reason','customer_history'" in low

# Scanner runs ahead of the two shopkeeper-friendly send windows.
assert "'15 2 * * *'" in sql      # 09:15 Vietnam
assert "'0 7 * * *'" in sql       # 14:00 Vietnam
for value in ("09:30", "10:30", "14:15", "15:30"):
    assert value in sql

# One daily care state per customer, and the scheduler never auto-sends customer chat.
assert "primary key (business_date, customer_id)" in low
assert "'max_contact_per_customer_per_day',1" in compact
assert "'auto_send',false" in compact
assert "taphoa_chat_notify_customer" not in low
assert "insert into public.v21_messages" not in low

print("Customer care schedule contract PASS")
