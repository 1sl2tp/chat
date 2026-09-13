from pathlib import Path

JS_PATH = Path(__file__).resolve().parents[1] / "admin-composer-actions.js"
JS = JS_PATH.read_text(encoding="utf-8").lower()
compact = "".join(JS.split())

assert "./admin-order-draft.js" in JS
assert "createfromparsed" in compact
assert "openlist" in compact
assert "activecontactname" in compact
assert "currentconversationid" in compact
assert "action:'draft'" in compact

segment = JS.split("label:'đơn tạm'", 1)[1].split("label:'đã giao'", 1)[0]
assert "sắp có" not in segment
assert "sao chép" not in JS
assert "navigator.clipboard" not in JS

print("chat draft order composer integration PASS")
