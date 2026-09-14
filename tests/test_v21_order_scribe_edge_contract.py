from pathlib import Path
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / "supabase/functions/v21-order-scribe/index.ts"
CORE = ROOT / "supabase/functions/v21-order-scribe/scribe-core.mjs"
MASTER_CORE = ROOT / "supabase/functions/v21-order-scribe/master-order-core.mjs"
PROMPTS = ROOT / "supabase/functions/v21-order-scribe/order-ai-prompts.mjs"
REFERENCE = ROOT / "supabase/functions/v21-order-scribe/grocery-reference.mjs"
SHARED = ROOT / "supabase/functions/_shared/customer-order-parser.mjs"
MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe.sql"
MODEL_MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe_model_35.sql"

for path in [EDGE, CORE, MASTER_CORE, PROMPTS, REFERENCE, SHARED, MIGRATION, MODEL_MIGRATION]:
    assert path.exists(), f"missing {path.name}"

edge = EDGE.read_text(encoding="utf-8")
core = CORE.read_text(encoding="utf-8")
master_core = MASTER_CORE.read_text(encoding="utf-8")
prompts = PROMPTS.read_text(encoding="utf-8")
reference = REFERENCE.read_text(encoding="utf-8")
shared = SHARED.read_text(encoding="utf-8")
migration = MIGRATION.read_text(encoding="utf-8")
model_migration = MODEL_MIGRATION.read_text(encoding="utf-8")
edge_lower = edge.lower()
compact = "".join(edge_lower.split())
reference_lower = reference.lower()
core_lower = core.lower()
master_lower = master_core.lower()

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
assert "responsemimetype:'application/json'" in compact

# One MASTER prompt for text/chat/voice and images.
assert "ORDER_MASTER_PROMPT" in edge
assert "ORDER_OCR_PROMPT" not in edge
assert "ORDER_NORMALIZE_PROMPT" not in edge
assert "resolveOrderWithAi" in edge
assert "parseMasterOrderResponseText" in edge
assert "master-order-core.mjs" in edge

# Raw source reaches MASTER; no lossy pre-filter before intent/correction analysis.
assert "const sourceText=clean(source.text,MAX_SOURCE_CHARS)" in edge
assert "resolveOrderWithAi(sourceText,images,cfg,referenceContext)" in edge
assert "ĐẦU VÀO TEXT / VOICE-TO-TEXT / SỬA ĐƠN QUA CHAT" in edge
assert "HÌNH ẢNH NGUỒN" in edge
assert "inlinedata" in edge_lower

for required in [
    "hinh anh viet tay",
    "hoa don",
    "voice-to-text",
    "hinh hoc net chu",
    "gach bo",
    "to xoa",
    "net gach ngan dau dong",
    "duong ke ngang dai",
    "strict original text protocol",
    "khong tu y bo sung don vi tinh",
    "khong tu bo sung thuong hieu",
    "thu vien tham chieu",
    "thuoc la",
    "intent",
    "no_action",
    "inquiry",
    "cancel_change",
    "loc nhieu",
    "khong lay a / lay b",
    "lay them",
    "normalized_name",
    "khong chua so luong",
    "khong chua don vi mua hang",
    "is_ambiguous",
    "inherited_from_line",
    "tieng viet khong dau",
    "sl + ten",
]:
    assert required in prompts_fold, f"MASTER rule missing: {required}"

# Deterministic server layer: visible output is always quantity + name only.
for required in [
    "parsemasterorderpayload",
    "empty_ok_intents",
    "no_action",
    "inquiry",
    "get_detail",
    "cancel_change",
    "normalized_name",
    "normalized_vn",
    "isambiguous",
    "item.quantitylabel} ${item.name",
]:
    assert required in master_lower, f"master response core missing: {required}"
assert "${item.unit}" not in master_core

assert "imageassetids" in edge_lower
assert "v21_media_assets" in edge_lower
assert "v21-media" in edge_lower
assert "owner_account_id" in edge_lower

# Catalog/reference data remains recognition evidence only.
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

print("manual order scribe reviewed full MASTER contract PASS")
