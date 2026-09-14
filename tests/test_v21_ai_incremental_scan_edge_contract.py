from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / 'supabase/functions/v21-order-auto-scan/index.ts'
CORE = ROOT / 'supabase/functions/v21-order-auto-scan/scan-core.mjs'

assert EDGE.exists(), 'automatic scan Edge Function must exist'
assert CORE.exists(), 'automatic scan core must exist'

text = EDGE.read_text(encoding='utf-8').lower()
compact = ''.join(text.split())

# Scheduler endpoint has its own secret; it must not depend on an end-user JWT.
assert 'x-chat-scan-token' in text
assert 'chat_ai_scan_runtime' in text
assert 'safeequal' in compact

# Only customer-group conversations are eligible.
assert 'contact_group' in text and "'customer'" in text
assert 'v21_conversations' in text

# Cursor is sequence-based and only NEW inbound customer messages are fetched.
assert 'message_seq' in text
assert "gt('message_seq'" in compact or '.gt("message_seq"' in compact
assert "order('message_seq',{ascending:true})" in compact or 'order("message_seq",{ascending:true})' in compact
assert 'last_message_seq' in text

# No new message => no Gemini call; first-seen pair is only baselined.
assert 'baseline' in text
assert 'no_new_messages' in text

# Text and images share the same scan request.
assert 'v21_media_assets' in text
assert "eq('kind','image')" in compact or 'eq("kind","image")' in compact
assert 'inlinedata' in compact
assert 'order_master_prompt' in text
assert 'source_message_seq' in text
assert 'source_line_no' in text

# Successful persistence must be atomic through the finalizer; failure must not move cursor directly.
assert 'chat_ai_finalize_scan' in text
assert 'chat_ai_scan_runs' in text

# Scanner never looks up products/catalog/market data.
for forbidden in [
    'grocery-reference', 'chat_ai_product_keys', 'getlink_',
    "from('products')", 'product_sources', 'rankgrocerycandidates',
]:
    assert forbidden not in text

print('incremental AI scan Edge contract PASS')
