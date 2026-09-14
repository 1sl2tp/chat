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

assert EDGE.exists()
assert CORE.exists()
assert PROMPTS.exists()
assert REFERENCE.exists()
assert SHARED.exists()
assert MIGRATION.exists()
assert MODEL_MIGRATION.exists()

edge = EDGE.read_text(encoding="utf-8")
core = CORE.read_text(encoding="utf-8")
prompts = PROMPTS.read_text(encoding="utf-8")
reference = REFERENCE.read_text(encoding="utf-8")
shared = SHARED.read_text(encoding="utf-8")
migration = MIGRATION.read_text(encoding="utf-8")
model_migration = MODEL_MIGRATION.read_text(encoding="utf-8")
edge_lower = edge.lower()
compact = "".join(edge_lower.split())
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

assert "../_shared/customer-order-parser.mjs" in core
assert "parsecustomertextpartial" in core_lower
assert "parsecustomertextpartial" in shared.lower()

assert "ai_unavailable" in edge_lower
assert "ai_response_invalid" in edge_lower
assert "ai_items_missing" in edge_lower
assert "gemini-3.5-flash-lite" in edge_lower
assert "generativelanguage.googleapis.com" in edge_lower

# One instruction source only: the uploaded MASTER prompt drives text, voice/chat and images.
assert "ORDER_MASTER_PROMPT" in edge
assert "ORDER_OCR_PROMPT" not in edge
assert "ORDER_NORMALIZE_PROMPT" not in edge
assert "ocrInboundImagesWithAi" not in edge
assert "normalizeOrderTextWithAi" not in edge
assert "extractOrderIntentSource" not in edge
assert "finalizeAiOrderText" not in edge
assert "resolveOrderWithAi" in edge
assert "parseMasterOrderResponse" in edge

# Raw source reaches the master prompt; correction/noise decisions must not be pre-filtered by code.
assert "const sourceText=clean(source.text,MAX_SOURCE_CHARS)" in edge
assert "resolveOrderWithAi(sourceText,images,cfg,referenceContext)" in edge
assert "ĐẦU VÀO TEXT / VOICE-TO-TEXT / SỬA ĐƠN QUA CHAT" in edge
assert "HÌNH ẢNH NGUỒN" in edge
assert "inlinedata" in edge_lower

for required in [
    "hinh anh viet tay",
    "hoa don",
    "nhan in",
    "text tho",
    "sua don qua chat",
    "voice-to-text",
    "thuoc la",
    "tobacco industry resolution",
    "fmcg entity resolution",
    "dau gach ngang",
    "a * b",
    "khong thuc hien phep tinh nhan",
    "loc nhieu hoi thoai",
    "bat buoc bo qua",
    "correction protocol",
    "khong phai [a] ma la [b]",
    "ko lay [a] / lay [b]",
    "lay them",
    "10 no 10 kia",
    "ma json chuan cau truc",
    "parsed_items",
    "quantity_number",
    "normalized_vn",
]:
    assert required in prompts_fold, f"MASTER rule missing: {required}"

assert "imageassetids" in edge_lower
assert "v21_media_assets" in edge_lower
assert "v21-media" in edge_lower
assert "owner_account_id" in edge_lower

# Catalog/reference data remains recognition evidence only; it never creates drafts or prices here.
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

print("manual order scribe single MASTER prompt contract PASS")
