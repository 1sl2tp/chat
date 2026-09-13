from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI_PATH = ROOT / "admin-order-draft.js"
UI = UI_PATH.read_text(encoding="utf-8").lower()
compact = "".join(UI.split())

assert "v21-order-draft" in UI
for action in [
    "create_from_lines",
    "search_products",
    "select_product",
    "create_product",
    "update_quantity",
]:
    assert action in UI

assert "data-draft-quantity" in UI or "dataset.draftquantity" in compact
assert "data-draft-raw-name" in UI or "dataset.draftrawname" in compact
assert "data-draft-product" in UI or "dataset.draftproduct" in compact
assert "tên sản phẩm" in UI
assert "giá" in UI
assert "gửi đơn" in UI
assert "thêm mới" in UI
assert "đơn tạm" in UI
assert "lockbaseui:true" in compact
assert "queuetext" not in compact
assert "v21_message_send" not in compact
assert "v21-ai-product-parser" not in UI
assert "data-draft-product-quantity" not in UI
assert "dataset.draftproductquantity" not in compact
assert "navigator.clipboard" not in UI

print("chat order draft UI contract PASS")
