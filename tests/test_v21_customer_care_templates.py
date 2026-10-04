from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MIG=(ROOT/'supabase/migrations/20261004195500_customer_care_professional_templates.sql').read_text('utf-8')
LOW=MIG.lower()
COMPACT=''.join(LOW.split())

assert "'reason','customer_history'" in COMPACT
assert "'reason','market'" in COMPACT
assert "'reason','catalog'" in COMPACT
assert "limit5" in COMPACT
assert "p.source_key=p_source_key" in COMPACT
assert "nhắc đơn sữa" in LOW
assert "nhắc đơn hàng" in LOW
assert "gợi ý sản phẩm:" in LOW
assert "xem hàng và đặt hàng:" in LOW
assert "thứ hai" in LOW and "chủ nhật" in LOW
assert "chat_customer_care_refresh(now())" in COMPACT

print("Customer care professional template + fallback contract PASS")
