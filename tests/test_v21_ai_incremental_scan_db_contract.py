from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260915_chat_ai_incremental_scan.sql'

assert MIGRATION.exists(), 'incremental scan migration must exist'
text = MIGRATION.read_text(encoding='utf-8').lower()
compact = ''.join(text.split())

# Stable monotonic cursor: never rely on timestamp alone to decide what was already scanned.
assert 'message_seq' in text
assert 'v21_messages_message_seq_seq' in text
assert 'unique' in text and 'message_seq' in text

# CHAT-side scan state only; no product/catalog linkage.
for table in [
    'chat_ai_scan_runtime',
    'chat_ai_scan_cursors',
    'chat_ai_intakes',
    'chat_ai_scan_runs',
    'chat_ai_scan_lines',
]:
    assert f'create table if not exists public.{table}' in text

for field in ['line_seq', 'source_message_seq', 'source_line_no', 'quantity', 'name', 'status']:
    assert field in text

assert 'contact_group' in text and "'customer'" in text
assert 'last_message_seq' in text
assert 'chat_ai_try_scan_lock' in text
assert 'chat_ai_finalize_scan' in text

# Idempotency: one source line can only be accepted once for an Admin.
assert 'source_message_id' in text and 'source_line_no' in text
assert 'unique' in text or 'create unique index' in text

# Existing customer history is baselined, not retroactively sent through AI.
assert 'baseline' in text or 'seed' in text

# Automatic scheduler is exactly every 15 minutes.
assert 'chat-ai-order-scan-15m' in text
assert '*/15 * * * *' in text
assert 'net.http_post' in text
assert 'x-chat-scan-token' in text

# Runtime/token tables are not client-readable.
assert 'enable row level security' in text
assert 'revoke all' in text

# Scanner is deliberately isolated from product/catalog data.
for forbidden in ['getlink_', 'chat_ai_product_keys', 'product_sources']:
    assert forbidden not in text

print('incremental AI scan database contract PASS')
