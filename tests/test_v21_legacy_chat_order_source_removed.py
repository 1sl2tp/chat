from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

index_source = (ROOT / 'index.source.html').read_text(encoding='utf-8')
index_built = (ROOT / 'index.html').read_text(encoding='utf-8')
composer = (ROOT / 'admin-composer-actions.js').read_text(encoding='utf-8')
workflow = (ROOT / '.github/workflows/verify-v21.yml').read_text(encoding='utf-8')

# Chat no longer owns any order parsing / product matching / draft-order flow.
for script_name in (
    'admin-order-source.js',
    'admin-ai-extract.js',
    'admin-order-draft.js',
    'order-scribe-client.js',
):
    assert script_name not in index_source, f'legacy Chat order script is still loaded in source: {script_name}'
    assert script_name not in index_built, f'legacy Chat order script is still loaded in built app: {script_name}'

for token in (
    "makeLabel('Đơn')",
    "label:'Tạo đơn'",
    "label:'Đơn tạm'",
    "label:'Đã giao'",
    'data-admin-order-action',
    'openOrder',
    'invokeOrderScribe',
    'selectedChatText',
    'captureChatSelection',
    "addEventListener('selectionchange'",
):
    assert token not in composer, f'legacy Chat order/selection behavior remains: {token}'

legacy_paths = [
    'admin-order-source.js',
    'order-source-core.mjs',
    'admin-ai-extract.js',
    'admin-order-draft.js',
    'order-scribe-client.js',
    'supabase/functions/_shared/customer-order-parser.mjs',
    'supabase/functions/v21-order-source',
    'supabase/functions/v21-order-scribe',
    'supabase/functions/v21-order-draft',
    'supabase/functions/v21-order-scan',
    'supabase/functions/v21-ai-product-parser',
]
for rel in legacy_paths:
    assert not (ROOT / rel).exists(), f'legacy Chat split/search/order artifact still exists: {rel}'

# Old tests must not keep the removed subsystem alive in CI.
for rel in (
    'tests/test_v21_ai_product_parser_core.mjs',
    'tests/test_v21_ai_product_catalog_search.mjs',
    'tests/test_v21_ai_order_summary.mjs',
    'tests/test_v21_ai_product_exact_key_prefix.mjs',
    'tests/test_v21_ai_product_parser_edge_contract.py',
    'tests/test_v21_ai_product_parser_db_contract.py',
    'tests/test_v21_order_scribe_core.mjs',
    'tests/test_v21_order_master_full.mjs',
    'tests/test_v21_order_scribe_inherit_marker.mjs',
    'tests/test_v21_order_scribe_client_runtime.js',
    'tests/test_v21_order_scribe_edge_contract.py',
    'tests/test_v21_grocery_reference.mjs',
    'tests/test_v21_order_scribe_inherit_marker_edge.py',
    'tests/test_v21_ai_incremental_scan_core.mjs',
    'tests/test_v21_ai_incremental_scan_db_contract.py',
    'tests/test_v21_order_draft_db_contract.py',
    'tests/test_v21_order_draft_core.mjs',
    'tests/test_v21_order_draft_edge_contract.py',
    'tests/test_v21_order_draft_ui.py',
    'tests/test_v21_order_draft_composer_integration.py',
):
    assert not (ROOT / rel).exists(), f'legacy Chat split/search/order test still exists: {rel}'

for label in (
    'Chat AI product parser core contract',
    'Chat shared-product catalog search contract',
    'Chat order summary footer contract',
    'Chat exact key common-left-prefix contract',
    'Chat AI product parser edge isolation contract',
    'Chat AI database isolation contract',
    'Manual order scribe raw-name core contract',
    'Master full SL + name contract',
    'Handwritten repeat-marker inheritance contract',
    'Manual order scribe client normalization',
    'Manual order scribe Edge contract',
    'Grocery reference ranking contract',
    'Handwritten repeat-marker Edge contract',
    'Incremental AI scan core contract',
    'Incremental AI scan database/edge contract',
    'Chat order draft database contract',
    'Chat order draft core contract',
    'Chat order draft Edge contract',
    'Chat order draft UI contract',
    'Chat order draft composer integration',
):
    assert f'- name: {label}' not in workflow, f'legacy verification step still active: {label}'

# Existing database history/data is intentionally left alone; this contract only removes runtime paths.
print('Chat legacy split/search/order removal contract PASS')
