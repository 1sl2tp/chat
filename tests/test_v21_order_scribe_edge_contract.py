from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / "supabase/functions/v21-order-scribe/index.ts"
CORE = ROOT / "supabase/functions/v21-order-scribe/scribe-core.mjs"
MIGRATION = ROOT / "supabase/migrations/20260913_chat_order_scribe.sql"

assert EDGE.exists(), "manual order scribe Edge Function must exist"
assert CORE.exists(), "manual order scribe core must exist"
assert MIGRATION.exists(), "order scribe runtime config migration must exist"

edge = EDGE.read_text(encoding="utf-8").lower()
core = CORE.read_text(encoding="utf-8").lower()
migration = MIGRATION.read_text(encoding="utf-8").lower()
compact = "".join(edge.split())

# Admin-only manual action. It must not be wired to the automatic message webhook.
assert "db.auth.getuser" in compact
assert 'eq("role","admin")' in compact or "eq('role','admin')" in compact
assert "contactid" in edge
assert "action==='quick'" in compact
assert "action!=='quick'&&action!=='ai'" in compact, "only quick/ai manual actions may enter the scribe"
assert "aispans(source.text)" in compact, "non-quick path must invoke the isolated AI scribe"
assert "chat_ai_message_inbox" not in edge
assert "chat_ai_enqueue" not in edge

# If the Admin does not explicitly select text, the server may use the latest inbound
# customer message for that contact/conversation.
assert "v21_conversations" in edge
assert "v21_messages" in edge
assert "sender_account_id" in edge
assert "order('created_at'" in compact or 'order("created_at"' in compact

# AI is only a boundary/quantity scribe. It must never return or accept rewritten product names.
assert "name_start" in edge
assert "name_end" in edge
assert "responsemimetype" in compact
assert "responseschema" in compact
assert "gemini-2.5-flash-lite" in edge
assert "generativelanguage.googleapis.com" in edge
assert "materializeaispans" in compact
for forbidden in ["catalog-search", "products_shared", "product_code", "resolveparsedlineswithcatalog"]:
    assert forbidden not in edge, f"manual order scribe must not translate names through catalog: {forbidden}"

# The Chat runtime owns the model setting but reuses the already-provisioned Gemini vault secret
# without copying or exposing the key to the browser.
assert "chat_order_scribe_runtime_settings" in migration
assert "chat_order_scribe_runtime_config" in migration
assert "getlink_order_agent_gemini_api_key" in migration
assert "revoke all" in migration

print("manual order scribe Edge contract PASS")
