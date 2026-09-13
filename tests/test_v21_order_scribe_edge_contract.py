from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / "supabase/functions/v21-order-scribe/index.ts"
CORE = ROOT / "supabase/functions/v21-order-scribe/scribe-core.mjs"
SHARED = ROOT / "supabase/functions/_shared/customer-order-parser.mjs"
MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe.sql"
MODEL_MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe_model_35.sql"

assert EDGE.exists(), "manual order scribe Edge Function must exist"
assert CORE.exists(), "manual order scribe core must exist"
assert SHARED.exists(), "Chat and Tách nhanh must share one customer-order parser core"
assert MIGRATION.exists(), "order scribe runtime config migration must exist"
assert MODEL_MIGRATION.exists(), "order scribe current-model migration must exist"

edge = EDGE.read_text(encoding="utf-8").lower()
core = CORE.read_text(encoding="utf-8").lower()
shared = SHARED.read_text(encoding="utf-8").lower()
migration = MIGRATION.read_text(encoding="utf-8").lower()
model_migration = MODEL_MIGRATION.read_text(encoding="utf-8").lower()
compact = "".join(edge.split())

# Admin-only manual action. It must not be wired to the automatic message webhook.
assert "db.auth.getuser" in compact
assert 'eq("role","admin")' in compact or "eq('role','admin')" in compact
assert "contactid" in edge
assert "action==='quick'" in compact
assert "action!=='quick'&&action!=='ai'" in compact, "only quick/ai manual actions may enter the scribe"
assert "chat_ai_message_inbox" not in edge
assert "chat_ai_enqueue" not in edge

# Quick parsing is partial-success and must preserve unresolved text for manual handling.
assert "unresolved:parsed.unresolved" in compact
assert "../_shared/customer-order-parser.mjs" in core, "Tách nhanh must import the same parser core as Chat"
assert "parsecustomertextpartial" in core
assert "parsecustomertextpartial" in shared

# Provider/network failures use stable application codes instead of surfacing HTTP details.
assert "ai_unavailable" in edge
assert "ai_response_invalid" in edge
assert "ai_request_failed" not in edge

# If the Admin does not explicitly select text, the server may use the latest inbound
# customer message for that contact/conversation.
assert "v21_conversations" in edge
assert "v21_messages" in edge
assert "sender_account_id" in edge
assert "order('created_at'" in compact or 'order("created_at"' in compact

# Text AI is only a boundary/quantity scribe. It must never translate names through catalog.
assert "name_start" in edge
assert "name_end" in edge
assert "responsemimetype" in compact
assert "responseschema" in compact
assert "gemini-3.5-flash-lite" in edge
assert "generativelanguage.googleapis.com" in edge
assert "materializeaispans" in compact
for forbidden in ["catalog-search", "products_shared", "product_code", "resolveparsedlineswithcatalog"]:
    assert forbidden not in edge, f"manual order scribe must not translate names through catalog: {forbidden}"

# Image AI is manual only: validate inbound image assets, download from canonical Chat
# storage, orient first, then TRANSCRIBE literally. AI must not directly rewrite a product name.
assert "imageassetids" in edge
assert "v21_media_assets" in edge
assert "v21-media" in edge
assert "inlinedata" in edge
assert "0/90/180/270" in edge, "vision prompt must explicitly handle rotated sender photos"
assert "xoay" in edge, "vision prompt must orient the image before handwriting extraction"
assert "chép nguyên văn" in edge, "handwriting stage must explicitly be literal transcription"
assert "không suy diễn" in edge, "vision must be forbidden from semantic correction/guessing"
assert "image_lines" in edge, "vision schema must return literal handwritten lines rather than product names"
assert "materializeaiimagetranscriptions" in compact, "server code must parse SL/name only after literal transcription"
assert "uncertain" in edge, "uncertain handwriting must be marked instead of guessed confidently"

# The Chat runtime owns the model setting but reuses the already-provisioned Gemini vault secret
# without copying or exposing the key to the browser.
assert "chat_order_scribe_runtime_settings" in migration
assert "chat_order_scribe_runtime_config" in migration
assert "getlink_order_agent_gemini_api_key" in migration
assert "revoke all" in migration
assert "gemini-3.5-flash-lite" in model_migration
assert "update public.chat_order_scribe_runtime_settings" in model_migration

print("manual order scribe Edge contract PASS")
