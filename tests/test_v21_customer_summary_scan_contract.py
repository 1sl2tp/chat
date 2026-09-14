from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

migration = ROOT / 'supabase/migrations/20260915_customer_summary_scan.sql'
edge = ROOT / 'supabase/functions/v21-customer-summary-scan/index.ts'
core = ROOT / 'supabase/functions/v21-customer-summary-scan/summary-core.mjs'

assert migration.exists(), 'customer summary scan migration is missing'
assert edge.exists(), 'customer summary scan edge function is missing'
assert core.exists(), 'customer summary scan core is missing'

m = migration.read_text('utf-8')
e = edge.read_text('utf-8')
c = core.read_text('utf-8')

# Every minute, but no more than 15 eligible customers per run.
assert "'* * * * *'" in m or "'* * * * *'," in m, 'scan must run once per minute'
assert '15' in m, 'database batch contract must cap at 15 customers'
assert 'LIMIT 15' in m.upper() or 'least(15' in m.lower(), 'eligible batch must be capped at 15 customers'

# A customer without their own message must never consume an API slot.
assert 'sender_account_id = a.id' in m or 'sender_account_id=a.id' in m, 'eligibility must require customer-authored chat'

# Whole chat history is loaded, but Admin is context only.
compact = e.replace(' ', '')
assert 'PAGE_SIZE' in e and '.range(' in e, 'full conversation history must be paged instead of using a recent window'
assert 'ADMIN_CONTEXT' in c, 'Admin messages must be clearly marked as context only'
assert 'KHACH' in c, 'customer messages must be clearly marked as customer source'
assert 'không được tạo hàng từ lời Admin' in c or 'không tạo hàng từ lời Admin' in c, 'prompt must forbid creating goods from Admin text'

# Images from the customer are part of the source: order image yes, product illustration no.
assert 'v21_media_assets' in e and "eq('kind','image')" in compact, 'customer images must be loaded for vision input'
assert 'ảnh đơn' in c.lower(), 'prompt must explicitly recognize order images'
assert 'ảnh minh họa' in c.lower() or 'ảnh minh hoạ' in c.lower(), 'prompt must explicitly ignore product-only illustration images'
assert 'lọc trùng' in c.lower() or 'trùng' in c.lower(), 'prompt must deduplicate image/text duplicates'

# Evidence must remain auditable; uncertain content cannot invent quantity.
assert 'raw_evidence' in c, 'AI output must preserve original evidence text'
assert 'ambiguous' in c, 'AI output must expose ambiguous lines'
assert 'không tự thêm số lượng' in c.lower(), 'prompt must forbid invented quantities by default'

# Per-customer exception requested for E Ngọc tt.
assert 'ngocle' in c.lower(), 'E Ngoc tt customer-specific speaking rule must be encoded'
assert 'mỗi màu' in c.lower(), 'E Ngoc same-product color variants must inherit one carton per color'

print('Customer summary scan contract PASS')
