from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / "supabase/functions/v21-order-scribe/index.ts"
CORE = ROOT / "supabase/functions/v21-order-scribe/scribe-core.mjs"
PROMPTS = ROOT / "supabase/functions/v21-order-scribe/order-ai-prompts.mjs"
SHARED = ROOT / "supabase/functions/_shared/customer-order-parser.mjs"
MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe.sql"
MODEL_MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe_model_35.sql"

assert EDGE.exists(), "manual order scribe Edge Function must exist"
assert CORE.exists(), "manual order scribe core must exist"
assert PROMPTS.exists(), "AI OCR/segmentation prompts must live in a dedicated lock file"
assert SHARED.exists(), "Chat and Tách nhanh must share one customer-order parser core"
assert MIGRATION.exists(), "order scribe runtime config migration must exist"
assert MODEL_MIGRATION.exists(), "order scribe current-model migration must exist"

edge = EDGE.read_text(encoding="utf-8")
core = CORE.read_text(encoding="utf-8")
prompts = PROMPTS.read_text(encoding="utf-8")
shared = SHARED.read_text(encoding="utf-8")
migration = MIGRATION.read_text(encoding="utf-8")
model_migration = MODEL_MIGRATION.read_text(encoding="utf-8")
edge_lower = edge.lower()
compact = "".join(edge_lower.split())

# Admin-only manual action. It must not be wired to the automatic message webhook.
assert "db.auth.getuser" in compact
assert 'eq("role","admin")' in compact or "eq('role','admin')" in compact
assert "contactid" in edge_lower
assert "action==='quick'" in compact
assert "action!=='quick'&&action!=='ai'" in compact, "only quick/ai manual actions may enter the scribe"
assert "chat_ai_message_inbox" not in edge_lower
assert "chat_ai_enqueue" not in edge_lower

# Quick parsing remains deterministic/partial-success and preserves unresolved text.
assert "unresolved:parsed.unresolved" in compact
assert "../_shared/customer-order-parser.mjs" in core
assert "parsecustomertextpartial" in core.lower()
assert "parsecustomertextpartial" in shared.lower()

# Provider/network failures use stable application codes.
assert "ai_unavailable" in edge_lower
assert "ai_response_invalid" in edge_lower
assert "gemini-3.5-flash-lite" in edge_lower
assert "generativelanguage.googleapis.com" in edge_lower

# Both selected text and OCR text must be forced into literal Vietnamese ASCII
# before AI segmentation. This is deterministic code, not a model preference.
assert "export function toGeometryAscii" in core
assert ".normalize('NFD')" in core or '.normalize("NFD")' in core
assert "toGeometryAscii" in edge
assert "source.text" in edge
assert "ocr" in edge_lower

# Image OCR is geometry/literal reading only: no spelling repair, catalog lookup,
# or semantic product-name normalization. Output is explicitly no-diacritic.
for required in [
    "hình học nét chữ",
    "không dấu",
    "không sửa chính tả",
    "không đoán",
    "không chuẩn hóa tên",
]:
    assert required.lower() in prompts.lower(), f"literal OCR prompt rule missing: {required}"

# Stage 2 may identify quantity and name boundaries, but it must never return or
# rewrite the product name. Server slices the name directly from ASCII source.
assert "ORDER_SEGMENT_PROMPT" in edge
assert "materializeAiSpans" in edge
assert "name_start" in edge and "name_end" in edge
assert "quantity_text" in edge
assert "source.slice" in core
assert "ORDER_NORMALIZE_PROMPT" not in edge
assert "normalizeOrderTextWithAi" not in edge

# Image AI remains manual and limited to canonical inbound Chat image assets.
assert "imageassetids" in edge_lower
assert "v21_media_assets" in edge_lower
assert "v21-media" in edge_lower
assert "inlinedata" in edge_lower
assert "owner_account_id" in edge_lower

# No catalog/SKU translation in this extraction stage.
for forbidden in ["catalog-search", "products_shared", "product_code", "resolveparsedlineswithcatalog"]:
    assert forbidden not in edge_lower, f"manual order scribe must not translate names through catalog: {forbidden}"

# Runtime owns the model setting but reuses the already-provisioned Gemini secret.
assert "chat_order_scribe_runtime_settings" in migration.lower()
assert "chat_order_scribe_runtime_config" in migration.lower()
assert "getlink_order_agent_gemini_api_key" in migration.lower()
assert "revoke all" in migration.lower()
assert "gemini-3.5-flash-lite" in model_migration.lower()
assert "update public.chat_order_scribe_runtime_settings" in model_migration.lower()

print("manual order scribe literal ASCII geometry contract PASS")