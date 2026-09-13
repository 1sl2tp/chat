from pathlib import Path

EDGE_PATH = Path(__file__).resolve().parents[1] / "supabase/functions/v21-order-draft/index.ts"
EDGE = EDGE_PATH.read_text(encoding="utf-8").lower()
compact = "".join(EDGE.split())

assert "db.auth.getuser" in compact
assert 'eq("role","admin")' in compact or "eq('role','admin')" in compact
for action in [
    "create_from_lines",
    "get",
    "list",
    "update_quantity",
    "search_products",
    "select_product",
    "create_product",
]:
    assert action in EDGE

assert "chat_order_draft_create" in EDGE
assert ".from('products')" in EDGE or '.from("products")' in EDGE
assert ".eq('active',true)" in compact or '.eq("active",true)' in compact
assert "select('id,name,price')" in compact or 'select("id,name,price")' in compact
assert "productid(" in compact
assert "created_by_account_id" in EDGE
assert "conversation_mismatch" in EDGE

for forbidden in [
    "v21-ai-product-parser",
    "getlink-order-agent",
    "resolveparsedlineswithcatalog",
    "queuetext",
    "v21_message_send",
]:
    assert forbidden not in EDGE

print("chat order draft Edge contract PASS")
