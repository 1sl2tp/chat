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
assert PROMPTS.exists(), "approved AI OCR/NLP prompts must live in a dedicated lock file"
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

# Approved Prompt 1 baseline: handwriting/image OCR. Keep the user's working wording.
for required in [
    "Bạn là một hệ thống OCR ghi nhận văn bản thô (Plain Text OCR).",
    "CHỈ lấy nội dung nằm TRỌN VẸN trên tờ giấy danh sách",
    "Xử lý LẦN LƯỢT TỪNG DÒNG MỘT từ trên xuống dưới.",
    "NÉT GẠCH NGẮN ĐẦU DÒNG (-): BỎ QUA nét gạch này",
    "ĐƯỜNG KẺ NGANG DÀI (______): Đây là ký hiệu LẶP LẠI.",
    "Đọc chính xác từng ký tự theo đúng hình học nét chữ trong ảnh",
    "CHUYỂN SỐ LƯỢNG LÊN ĐẦU DÒNG",
    "Không chứa bất kỳ định dạng markdown, lời giải thích hay câu mở đầu/kết thúc.",
]:
    assert required in prompts, f"OCR prompt baseline missing: {required}"

# Approved Prompt 2 baseline: normalize selected text / OCR output to SL + name lines.
for required in [
    "Bạn là một hệ thống trích xuất và chuẩn hóa đơn hàng bán buôn/bán lẻ (Order Parsing OCR & NLP System).",
    "ĐỊNH DẠNG MỖI DÒNG: [Số lượng dạng số] [Tên sản phẩm/Nhãn hàng/Đặc tính]",
    "Bỏ toàn bộ các từ chỉ đơn vị tính ở cuối hoặc giữa dòng",
    "Tách các câu văn nói dài",
    "Chuyển toàn bộ từ chỉ số lượng bằng chữ",
    "GIỮ NGUYÊN THỨ TỰ CÂU TRONG ẢNH/ĐẦU VÀO",
    "Không chứa bất kỳ định dạng Markdown, lời giải thích hay câu mở đầu/kết thúc.",
]:
    assert required in prompts, f"normalization prompt baseline missing: {required}"

# The Edge Function must use Prompt 2 directly for selected text and a strict
# Prompt 1 -> Prompt 2 pipeline for inbound customer images.
assert "ORDER_OCR_PROMPT" in edge
assert "ORDER_NORMALIZE_PROMPT" in edge
assert "geminiTextRequest" in edge
assert "normalizeOrderTextWithAi" in edge
assert "ocrInboundImagesWithAi" in edge
assert "parseNormalizedOrderText" in core
assert "materializeAiSpans" not in edge, "AI mode should no longer use the old boundary-only prompt"
assert "image_lines" not in edge, "image flow should run the approved plain-text OCR prompt instead of the old JSON transcription schema"

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

print("manual order scribe Edge contract PASS")
