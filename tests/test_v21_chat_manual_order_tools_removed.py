from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

actions_path = ROOT / 'admin-composer-actions.js'
actions = actions_path.read_text(encoding='utf-8').lower()
workflow = (ROOT / '.github/workflows/verify-v21.yml').read_text(encoding='utf-8')

# Chat keeps only communication actions. Order extraction/search now belongs to KH scanner.
for forbidden in (
    "tách nhanh",
    "ai ghi đơn",
    "v21-order-scribe",
    "data-order-mode",
    "action:'create'",
    "action:'draft'",
    "label:'tạo đơn'",
    "label:'đơn tạm'",
    "v21adminordersource",
    "admin-order-draft.js",
):
    assert forbidden not in actions, f'legacy manual Chat order path still present: {forbidden}'

# Selection/image AI and manual scribe client must not exist in Chat runtime anymore.
for rel in (
    'admin-ai-extract.js',
    'admin-order-draft.js',
    'order-scribe-client.js',
):
    assert not (ROOT / rel).exists(), f'legacy Chat manual AI artifact still exists: {rel}'

for html_name in ('index.source.html', 'index.html'):
    html = (ROOT / html_name).read_text(encoding='utf-8').lower()
    assert 'order-scribe-client.js' not in html, f'{html_name} still loads manual order-scribe client'
    assert 'admin-ai-extract.js' not in html, f'{html_name} still loads selection/image AI extraction'

# Verification must no longer require the deleted manual UI/client path.
for label in (
    'Manual order scribe client normalization',
    'Chat order draft UI contract',
    'Chat order draft composer integration',
):
    assert f'- name: {label}' not in workflow, f'legacy verification step still active: {label}'

# KH incremental scanner remains the only automatic extraction owner.
assert (ROOT / 'supabase/functions/v21-order-scan/index.ts').exists()
assert (ROOT / 'tests/test_v21_ai_incremental_scan_db_contract.py').exists()

print('manual Chat order extraction/search removal contract PASS')
