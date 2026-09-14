from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

index_source = (ROOT / 'index.source.html').read_text(encoding='utf-8')
index_built = (ROOT / 'index.html').read_text(encoding='utf-8')
workflow = (ROOT / '.github/workflows/verify-v21.yml').read_text(encoding='utf-8')

assert 'admin-order-source.js' not in index_source, 'legacy Chat order-source script is still loaded'
assert 'admin-order-source.js' not in index_built, 'built app still contains legacy Chat order-source runtime'

legacy_paths = [
    'admin-order-source.js',
    'order-source-core.mjs',
    'supabase/functions/v21-order-source/index.ts',
    'supabase/functions/v21-order-source/source-core.mjs',
    'tests/test_v21_order_source_core.mjs',
    'tests/test_v21_order_source_db_contract.py',
    'tests/test_v21_order_source_edge_contract.py',
    'tests/test_v21_order_source_ui.py',
]
for rel in legacy_paths:
    assert not (ROOT / rel).exists(), f'legacy Chat order-source artifact still exists: {rel}'

for label in (
    'Customer order source core contract',
    'Customer order source database contract',
    'Customer order source Edge contract',
    'Customer order source timeline UI contract',
):
    assert f'- name: {label}' not in workflow, f'legacy verification step still active: {label}'

cleanup = ROOT / 'supabase/migrations/20260915_remove_legacy_chat_order_source.sql'
assert cleanup.exists(), 'database cleanup migration is missing'
sql = cleanup.read_text(encoding='utf-8').lower()
assert 'drop table if exists public.chat_order_source_states' in sql

# The new KH incremental scanner remains the only order-source ingestion path.
assert (ROOT / 'supabase/functions/v21-order-scan/index.ts').exists()
assert (ROOT / 'tests/test_v21_ai_incremental_scan_db_contract.py').exists()

print('legacy Chat order-source removal contract PASS')
