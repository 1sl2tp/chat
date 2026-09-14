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
assert PROMPTS.exists(), "AI OCR/NLP prompts must live in a dedicated lock file"
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
prompts_lower = prompts.lower()

# Admin-only manual action. It must not be wired to the automatic message webhook.
assert "db.auth.getuser" in compact
assert 'eq("role","admin")' in compact or "eq('role','admin')" in compact
assert "contactid" in edge_lower
assert "action==='quick'" in compact
assert "action!=='quick'&&action!=='ai'" in compact
assert "chat_ai_message_inbox" not in edge_lower
assert "chat_ai_enqueue" not in edge_lower

# Quick parsing remains deterministic/partial-success.
assert "unresolved:parsed.unresolved" in compact
assert "../_shared/customer-order-parser.mjs" in core
assert "parsecustomertextpartial" in core.lower()
assert "parsecustomertextpartial" in shared.lower()

# Provider/network failures use stable application codes.
assert "ai_unavailable" in edge_lower
assert "ai_response_invalid" in edge_lower
assert "gemini-3.5-flash-lite" in edge_lower
assert "generativelanguage.googleapis.com" in edge_lower

# Restore the proven two-stage pipeline: image OCR first, then grocery-aware NLP
# normalization for both OCR output and selected/spoken text.
assert "ORDER_OCR_PROMPT" in edge
assert "ORDER_NORMALIZE_PROMPT" in edge
assert "normalizeOrderTextWithAi" in edge
assert "ocrInboundImagesWithAi" in edge
assert "parseNormalizedOrderText" in edge
assert "ORDER_SEGMENT_PROMPT" not in edge
assert "materializeAiSpans" not in edge

# Vietnamese grocery context is intentional. Geometry is primary for handwriting,
# but ambiguous strokes may be resolved using common grocery brands/categories and
# abbreviations rather than treating every glyph as context-free ASCII.
for required in [
    "tạp hóa việt nam",
    "thương hiệu",
    "từ viết tắt",
    "dg",
    "duong",
    "sữa",
    "dầu ăn",
    "tương",
    "probi",
    "omo",
    "ps",
]:
    assert required in prompts_lower, f"grocery OCR/NLP context missing: {required}"

# OCR still respects geometry, line order, short-vs-long dash semantics, and ignores
# clearly crossed-out/deleted writing.
for required in [
    "đúng hình học nét chữ",
    "nét gạch ngắn đầu dòng",
    "đường kẻ ngang dài",
    "gạch bỏ",
    "tô xóa",
]:
    assert required in prompts_lower, f"handwriting geometry rule missing: {required}"

# Final user-visible AI text is deterministically no-diacritic even though the model
# may reason in Vietnamese/grocery context internally.
assert "export function toGeometryAscii" in core
assert "toGeometryAscii(normalized)" in edge
assert "parseNormalizedOrderText(asciiNormalized)" in edge

# Image AI remains manual and limited to canonical inbound Chat image assets.
assert "imageassetids" in edge_lower
assert "v21_media_assets" in edge_lower
assert "v21-media" in edge_lower
assert "inlinedata" in edge_lower
assert "owner_account_id" in edge_lower

# No catalog/SKU lookup: semantic context comes from the prompt/model, not product DB mapping.
for forbidden in ["catalog-search", "products_shared", "product_code", "resolveparsedlineswithcatalog"]:
    assert forbidden not in edge_lower

assert "chat_order_scribe_runtime_settings" in migration.lower()
assert "chat_order_scribe_runtime_config" in migration.lower()
assert "getlink_order_agent_gemini_api_key" in migration.lower()
assert "revoke all" in migration.lower()
assert "gemini-3.5-flash-lite" in model_migration.lower()
assert "update public.chat_order_scribe_runtime_settings" in model_migration.lower()

print("manual order scribe grocery-aware OCR/NLP contract PASS")