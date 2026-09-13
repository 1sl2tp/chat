from pathlib import Path

JS_PATH = Path(__file__).resolve().parents[1] / "admin-composer-actions.js"
JS = JS_PATH.read_text(encoding="utf-8").lower()
compact = "".join(JS.split())

# Draft browsing remains available as a separate action.
assert "./admin-order-draft.js" in JS
assert "openlist" in compact
assert "action:'draft'" in compact

# Create-order now opens the inbound source timeline for the current customer.
assert "v21adminordersource" in compact
assert ".open({preset:'today'})" in compact
create_segment = compact.split("if(action==='create')", 1)[1].split("if(action==='draft')", 1)[0]
assert "v21adminordersource" in create_segment
assert "invokeorderscribe" not in create_segment
assert "openorder(contactid)" not in create_segment

segment = JS.split("label:'đơn tạm'", 1)[1].split("label:'đã giao'", 1)[0]
assert "sắp có" not in segment
assert "sao chép" not in JS
assert "navigator.clipboard" not in JS

print("chat draft order composer integration PASS")
