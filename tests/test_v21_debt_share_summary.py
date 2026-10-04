from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MIG=(ROOT/'supabase/migrations/20261004203000_chat_debt_share_summary.sql').read_text('utf-8')
LOW=MIG.lower()
COMPACT=''.join(LOW.split())

assert "create or replace function public.v21_admin_debt_share_summary" in LOW
assert "v21_private.current_active_account_id()" in LOW
assert "a.role='admin'" in COMPACT
assert "a.contact_group='customer'" in COMPACT
assert "sum(l.amount_vnd)" in LOW
assert "running_balance<=0" in COMPACT
assert "row_number()over(orderbyl.created_at,l.id)" in COMPACT
assert "v_debt_days" in LOW
assert "count(distinctl.order_id)" in COMPACT
assert "o.status='delivered'" in COMPACT
assert "đối chiếu công nợ" in LOW
assert "đợt công nợ hiện tại bắt đầu từ" in LOW
assert "đơn đã giao" in LOW
assert "chưa thanh toán hết" in LOW
assert "nếu có khoản nào chưa khớp" in LOW
assert "xem chi tiết công nợ:" in LOW
assert "đã được thanh toán đầy đủ" in LOW
assert "toauthenticated,service_role" in COMPACT
assert "from public,anon;" in LOW

print("Admin debt share summary contract PASS")


ATOMIC=(ROOT/'supabase/migrations/20261004203500_chat_send_debt_summary_atomic.sql').read_text('utf-8')
ATOMIC_LOW=ATOMIC.lower()
ATOMIC_COMPACT=''.join(ATOMIC_LOW.split())
assert "create or replace function public.v21_admin_send_debt_summary" in ATOMIC_LOW
assert "v21_private.current_active_account_id()" in ATOMIC_LOW
assert "v21_private.debt_share_summary_payload(p_customer_id,now())" in ATOMIC_COMPACT
assert "taphoa_chat_notify_customer" in ATOMIC_LOW
assert "'debt-share:'||v_client_id" in ATOMIC_COMPACT
assert "'message_id',v_message_id" in ATOMIC_COMPACT
assert "'sent',v_message_idisnotnull" in ATOMIC_COMPACT
assert "toauthenticated,service_role" in ATOMIC_COMPACT
