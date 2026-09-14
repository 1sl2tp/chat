from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MIGRATION=ROOT/'supabase/migrations/20260915_chat_ai_incremental_scan.sql'
EDGE=ROOT/'supabase/functions/v21-order-scan/index.ts'

sql=MIGRATION.read_text(encoding='utf-8')
edge=EDGE.read_text(encoding='utf-8')

assert 'chat_ai_scan_sources' in sql
assert 'source_seq bigint generated' in sql.lower()
assert 'unique(message_id)' in sql.replace(' ','').lower() or 'unique (message_id)' in sql.lower()
assert "contact_group = 'customer'" in sql or "contact_group='customer'" in sql
assert 'chat_ai_scan_cursors' in sql
assert 'last_source_seq' in sql
assert 'chat_ai_scan_runs' in sql
assert 'chat_ai_scan_lines' in sql
assert 'line_no' in sql and 'quantity' in sql and 'raw_name' in sql
assert "cron.schedule" in sql
assert "*/15 * * * *" in sql
assert 'v21-order-scan' in sql
assert 'x-order-scan-key' in sql

# Runtime must not consult product/catalog history. AI is only a transcriber + semantic filter.
for forbidden in ('products','chat_ai_product_keys','getlink_','grocery-reference','chat_order_drafts','chat_order_source_states'):
    assert forbidden not in edge, f'old/catalog data dependency leaked into incremental scanner: {forbidden}'

assert ".order('source_seq',{ascending:true})" in edge
assert 'last_source_seq' in edge
assert 'if(!sources.length)' in edge or 'if (!sources.length)' in edge

print('incremental AI scan database/edge contract PASS')
