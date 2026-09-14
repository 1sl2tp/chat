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
cl = c.lower()

# Every minute, but no more than 15 eligible customers per run.
assert "'* * * * *'" in m or "'* * * * *'," in m, 'scan must run once per minute'
assert '15' in m, 'database batch contract must cap at 15 customers'
assert 'LIMIT 15' in m.upper() or 'least(15' in m.lower(), 'eligible batch must be capped at 15 customers'

# A customer without their own message must never consume an API slot.
assert 'sender_account_id = a.id' in m or 'sender_account_id=a.id' in m, 'eligibility must require customer-authored chat'

# The claim upsert must not use the OUT-parameter name as an ambiguous conflict target.
assert 'on conflict on constraint chat_customer_summary_state_pkey' in m.lower(), 'claim batch must use the named PK constraint to avoid customer_id ambiguity'

# Whole chat history is loaded, but Admin is context only.
compact = e.replace(' ', '')
assert 'PAGE_SIZE' in e and '.range(' in e, 'full conversation history must be paged instead of using a recent window'
assert 'ADMIN_CONTEXT' in c, 'Admin messages must be clearly marked as context only'
assert 'KHACH' in c, 'customer messages must be clearly marked as customer source'
assert 'không được tạo hàng từ lời admin' in cl or 'không tạo hàng từ lời admin' in cl, 'prompt must forbid creating goods from Admin text'

# Images from the customer are part of the source: order image yes, product illustration no.
assert 'v21_media_assets' in e and "eq('kind','image')" in compact, 'customer images must be loaded for vision input'
assert 'ảnh đơn' in cl, 'prompt must explicitly recognize order images'
assert 'ảnh minh họa' in cl or 'ảnh minh hoạ' in cl, 'prompt must explicitly ignore product-only illustration images'
assert 'lọc trùng' in cl or 'trùng' in cl, 'prompt must deduplicate image/text duplicates'

# Handwritten order images must be read losslessly before reconciliation. Similar-looking
# variants are separate physical rows and must not be dropped as duplicates.
assert 'từng dòng vật lý' in cl, 'prompt must require a physical-row inventory before image reconciliation'
assert 'có đường' in cl and 'ít đường' in cl and 'không đường' in cl, 'prompt must distinguish sugar variants instead of deduplicating them'
assert 'không được coi là trùng' in cl or 'không coi là trùng' in cl, 'prompt must forbid deduplicating distinct product variants'
assert 'appendImageReadVerify' in e, 'edge input must include a second verification pass for each order image in the same AI call'
assert 'ẢNH ĐỌC LẦN 1' in e and 'ẢNH KIỂM TRA LẦN 2' in e, 'each image must be presented for read then verification without another API call'

# Evidence must remain auditable; uncertain content cannot invent quantity.
assert 'raw_evidence' in c, 'AI output must preserve original evidence text'
assert 'ambiguous' in c, 'AI output must expose ambiguous lines'
assert 'không tự thêm số lượng' in cl, 'prompt must forbid invented quantities by default'

# Per-customer exception requested for E Ngọc tt.
assert 'ngocle' in cl, 'E Ngoc tt customer-specific speaking rule must be encoded'
assert 'mỗi màu' in cl, 'E Ngoc same-product color variants must inherit one carton per color'

# PostgREST builders are PromiseLike, not regular Promises. Error recording must not call
# .catch() on the builder; otherwise the first customer error can abort the whole 15-customer batch.
assert '.catch(()=>{})' not in compact, 'recordFailure must contain DB write errors with try/catch, not builder.catch()'
assert 'async function safeDbWrite' in e or 'try{' in e[e.find('async function recordFailure'):e.find('async function scanCustomer')], 'recordFailure must safely isolate its own DB write failures'

print('Customer summary scan contract PASS')
