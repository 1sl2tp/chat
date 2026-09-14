from pathlib import Path
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / "supabase/functions/v21-order-scribe/index.ts"
CORE = ROOT / "supabase/functions/v21-order-scribe/scribe-core.mjs"
PROMPTS = ROOT / "supabase/functions/v21-order-scribe/order-ai-prompts.mjs"
REFERENCE = ROOT / "supabase/functions/v21-order-scribe/grocery-reference.mjs"
SHARED = ROOT / "supabase/functions/_shared/customer-order-parser.mjs"
MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe.sql"
MODEL_MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe_model_35.sql"

assert EDGE.exists(), "manual order scribe Edge Function must exist"
assert CORE.exists(), "manual order scribe core must exist"
assert PROMPTS.exists(), "AI OCR/NLP prompts must live in a dedicated lock file"
assert REFERENCE.exists(), "grocery recognition reference module must exist"
assert SHARED.exists(), "Chat and Tách nhanh must share one customer-order parser core"
assert MIGRATION.exists(), "order scribe runtime config migration must exist"
assert MODEL_MIGRATION.exists(), "order scribe current-model migration must exist"

edge = EDGE.read_text(encoding="utf-8")
core = CORE.read_text(encoding="utf-8")
prompts = PROMPTS.read_text(encoding="utf-8")
reference = REFERENCE.read_text(encoding="utf-8")
shared = SHARED.read_text(encoding="utf-8")
migration = MIGRATION.read_text(encoding="utf-8")
model_migration = MODEL_MIGRATION.read_text(encoding="utf-8")
edge_lower = edge.lower()
compact = "".join(edge_lower.split())
prompts_lower = prompts.lower()
reference_lower = reference.lower()
core_lower = core.lower()

def fold(value: str) -> str:
    value = unicodedata.normalize("NFD", value).replace("đ", "d").replace("Đ", "D")
    return "".join(ch for ch in value if unicodedata.category(ch) != "Mn").lower()

prompts_fold = fold(prompts)

assert "db.auth.getuser" in compact
assert 'eq("role","admin")' in compact or "eq('role','admin')" in compact
assert "contactid" in edge_lower
assert "action==='quick'" in compact
assert "action!=='quick'&&action!=='ai'" in compact
assert "chat_ai_message_inbox" not in edge_lower
assert "chat_ai_enqueue" not in edge_lower

assert "unresolved:final.unresolved" in compact
assert "text:final.text" in compact
assert "../_shared/customer-order-parser.mjs" in core
assert "parsecustomertextpartial" in core_lower
assert "parsecustomertextpartial" in shared.lower()

assert "ai_unavailable" in edge_lower
assert "ai_response_invalid" in edge_lower
assert "ai_items_missing" in edge_lower
assert "gemini-3.5-flash-lite" in edge_lower
assert "generativelanguage.googleapis.com" in edge_lower

assert "ORDER_OCR_PROMPT" in edge
assert "ORDER_NORMALIZE_PROMPT" in edge
assert "normalizeOrderTextWithAi" in edge
assert "ocrInboundImagesWithAi" in edge
assert "extractOrderIntentSource" in edge
assert "finalizeAiOrderText" in edge
assert "ORDER_SEGMENT_PROMPT" not in edge
assert "materializeAiSpans" not in edge

# Both selected text and OCR image text must pass through the same order-intent filter.
assert "let aiInput=extractOrderIntentSource(source.text)" in edge
assert "const filteredOcr=extractOrderIntentSource(ocrText)" in edge
assert "const final=finalizeAiOrderText(normalized)" in edge
assert "if(!final.items.length)throw new Error('ai_items_missing')" in edge

for required in [
    "tap hoa/fmcg viet nam",
    "thuong hieu",
    "alias",
    "spec",
    "danh muc cha",
    "dg",
    "sua",
    "dau an",
    "tuong",
    "thuoc la",
    "thu vien tham chieu",
    "khong tu them",
    "banh gao",
    "dns 681",
    "xx poni",
    "sl + ten",
    "nhe",
    "cam on",
]:
    assert required in prompts_fold, f"FMCG OCR/NLP rule missing: {required}"

for required in [
    "hinh hoc net chu",
    "gach ngan dau dong",
    "gach ngang dai",
    "gach bo",
    "to xoa",
    "moi dong doc lap",
]:
    assert required in prompts_fold, f"handwriting geometry rule missing: {required}"

assert "export function toGeometryAscii" in core
assert "export function extractOrderIntentSource" in core
assert "export function finalizeAiOrderText" in core
assert "formatOrderItems(parsed.items)" in core

assert "imageassetids" in edge_lower
assert "v21_media_assets" in edge_lower
assert "v21-media" in edge_lower
assert "inlinedata" in edge_lower
assert "owner_account_id" in edge_lower

# Catalog data is recognition evidence only. It may rank names/categories/aliases/specs,
# but must not resolve a SKU, price, order line, or draft automatically.
for required in [
    "chat_ai_product_keys",
    "products",
    "getlink_supplier_products",
    "getlink_links",
    "getlink_brand_aliases",
    "rankgrocerycandidates",
    "buildgroceryreferencecontext",
    "aliases",
    "specs",
    "level9",
]:
    assert required in (edge_lower + reference_lower), f"grocery reference source missing: {required}"
for forbidden in ["resolveparsedlineswithcatalog", "createfromparsed", "draft_id", "unit_price", "price_vnd"]:
    assert forbidden not in edge_lower, f"recognition flow must stay read-only: {forbidden}"

assert "chat_order_scribe_runtime_settings" in migration.lower()
assert "chat_order_scribe_runtime_config" in migration.lower()
assert "getlink_order_agent_gemini_api_key" in migration.lower()
assert "revoke all" in migration.lower()
assert "gemini-3.5-flash-lite" in model_migration.lower()
assert "update public.chat_order_scribe_runtime_settings" in model_migration.lower()

print("manual order scribe FMCG intent-filter OCR/NLP contract PASS")
