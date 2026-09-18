from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "quote-client.js"
ACTIONS = ROOT / "admin-composer-actions.js"
CALL_CLIENT = ROOT / "call-invite-client.js"
DIRECTORY = ROOT / "contact-directory-admin.js"

assert CLIENT.exists(), "quotation UI/client module must exist"
assert CALL_CLIENT.exists(), "call invite client module must exist"
assert ACTIONS.exists(), "Admin composer actions module must exist"
assert DIRECTORY.exists(), "contact directory admin module must exist"

quote = CLIENT.read_text(encoding="utf-8")
actions = ACTIONS.read_text(encoding="utf-8")
call = CALL_CLIENT.read_text(encoding="utf-8")
directory = DIRECTORY.read_text(encoding="utf-8")
low = actions.lower()
compact = "".join(low.split())
quote_low = quote.lower()
directory_low = directory.lower()

for needle in [
    "role==='admin'",
    "[data-contact-manage]",
    "[data-profile-overlay]",
    "báo giá",
    "tất cả",
    "theo nguồn",
    "tạo link",
    "sao chép",
    "gửi",
    "hang-thuong",
    "hang-u",
    "sua",
    "thuoc-la",
    "listsources",
    "v21-quote",
    "navigator.clipboard",
    "v21syncengine",
    "queuetext",
]:
    assert needle in quote_low, f"missing quotation Chat UI contract: {needle}"

assert "import('./quote-client.js')" in directory or 'import("./quote-client.js")' in directory
for forbidden in ["v21-zalo-", "zalo.me", "openapi.zalo", "zalo api"]:
    assert forbidden not in quote_low
assert "functions.invoke('v21-quote'" in quote_low or 'functions.invoke("v21-quote"' in quote_low
assert "contactid:targetaccountid" in quote_low.replace(" ", "")

for needle in ["role==='admin'", "báo giá", "link gọi", "data-admin-composer-action"]:
    assert needle in low, f"missing Admin composer action contract: {needle}"

for forbidden in [
    "tạo đơn", "đơn tạm", "đã giao", "công nợ", "data-admin-order-action",
    "tách nhanh", "ai ghi đơn", "v21-order-scribe", "data-order-mode",
    "selectedchattext", "capturechatselection", "selectionchange",
]:
    assert forbidden not in low, f"legacy Chat order/split behavior remains: {forbidden}"

assert "v21quoteclient" in low
assert "queuetext" in low or "v21messagestore" in low
assert "contactid" in low
quote_overlay_css = low.split(".admin-composer-quote-overlay", 1)[1].split("}", 1)[0]
assert "pointer-events:auto" in quote_overlay_css
assert "v21interactioncontroller" in low
assert "enter?.(" in compact and "lockbaseui:true" in compact
assert "admin-quote-modal" in low
assert "exit?.(" in compact
assert "taphoacallinviteclient" in low
assert "createandsend" in low and "contactid" in low
assert "v21_call_start" not in low
assert "[data-quote-admin-block]" in actions
assert "[data-call-invite-admin-block]" in actions
assert "display:none!important" in low
assert "node.remove()" not in low
assert "new mutationobserver(schedulelegacysuppression)" not in low
assert "import('./admin-composer-actions.js')" in quote or 'import("./admin-composer-actions.js")' in quote
subprocess.run(["node", "--check", str(ACTIONS)], check=True)
print("chat quote + Admin composer actions contract PASS")
