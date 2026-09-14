from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIONS_PATH = ROOT / "admin-composer-actions.js"
AI_PATH = ROOT / "admin-ai-extract.js"
CLIENT_PATH = ROOT / "order-scribe-client.js"

ACTIONS = ACTIONS_PATH.read_text(encoding="utf-8").lower()
CLIENT = CLIENT_PATH.read_text(encoding="utf-8")
compact = "".join(ACTIONS.split())

# Existing draft/order workflow remains available.
assert "./admin-order-draft.js" in ACTIONS
assert "openlist" in compact
assert "action:'draft'" in compact
assert "v21adminordersource" in compact

# Dedicated AI extraction UI must exist and be bootstrapped by the order-scribe client.
assert AI_PATH.exists(), "selection/image AI extraction UI module must exist"
ai = AI_PATH.read_text(encoding="utf-8")
ai_lower = ai.lower()
assert 'data-ai-selection-action' in ai
assert 'selectionchange' in ai_lower
assert 'getboundingclientrect' in ai_lower, "selection AI action should float near the selected text"
assert '#messageWindow' in ai or '#scrollRoot' in ai, "only chat selections may trigger the AI action"
assert 'V21OrderScribeClient' in ai
assert '.ai(' in ai
assert 'imageAssetIds' in ai
assert 'navigator.clipboard' in ai, "AI result must support copy"
assert 'createFromParsed' in ai, "AI result must optionally enter the existing draft-order flow"
assert 'data-ai-result' in ai, "AI output needs its own compact result surface"
assert './admin-ai-extract.js' in CLIENT, "order-scribe client must bootstrap the AI extraction UI module"

# The dedicated module extends the existing image viewer without changing viewer ownership.
assert 'data-image-ai-action' in ai
assert '.image-review-head' in ai
assert 'aria-current' in ai and 'image-review-thumb-image' in ai
assert 'dataset.assetId' in ai

print("chat draft/order + AI extraction integration PASS")
