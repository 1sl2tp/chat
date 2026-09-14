from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / 'supabase/functions/v21-order-source/index.ts'
CORE = ROOT / 'supabase/functions/v21-order-source/source-core.mjs'

edge = EDGE.read_text(encoding='utf-8')
core = CORE.read_text(encoding='utf-8')

# The old source browser must no longer decide which messages "look like" orders.
# New automatic scanning sends only unseen customer input to AI, which performs semantic filtering.
assert 'isLikelyOrderSource' not in edge
assert 'isLikelyOrderSource' not in core
assert 'includeAll||imageAssets.length>0||' not in edge

print('legacy order-source heuristic retired PASS')
