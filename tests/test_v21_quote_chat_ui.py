from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "index.source.html"
CLIENT = ROOT / "quote-client.js"
ACTIONS = ROOT / "admin-composer-actions.js"
ACTIONS_CSS = ROOT / "admin-composer-actions.css"
CALL_CLIENT = ROOT / "call-invite-client.js"
DIRECTORY = ROOT / "contact-directory-admin.js"

assert CLIENT.exists(), "quotation UI/client module must exist"
assert CALL_CLIENT.exists(), "call invite client module must exist"
assert ACTIONS.exists(), "Admin composer actions module must exist"
assert ACTIONS_CSS.exists(), "Admin composer actions stylesheet must exist"
assert DIRECTORY.exists(), "contact directory admin module must exist"

quote = CLIENT.read_text(encoding="utf-8")
actions = ACTIONS.read_text(encoding="utf-8")
actions_css = ACTIONS_CSS.read_text(encoding="utf-8")
call = CALL_CLIENT.read_text(encoding="utf-8")
directory = DIRECTORY.read_text(encoding="utf-8")
source = SOURCE.read_text(encoding="utf-8")
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
    "link báo giá",
    "hang-thuong",
    "hang-u",
    "sua",
    "thuoc-la",
    "listsources",
    "v21-quote",
    "navigator.clipboard",
]:
    assert needle in quote_low, f"missing quotation Chat UI contract: {needle}"

for forbidden in ["v21-zalo-", "zalo.me", "openapi.zalo", "zalo api"]:
    assert forbidden not in quote_low
assert "functions.invoke('v21-quote'" in quote_low or 'functions.invoke("v21-quote"' in quote_low
assert "data-quote-send" not in quote_low
assert "tạo link cho" in quote_low
assert "đang tạo và gửi" in low

for needle in ["role==='admin'", "báo giá", "link gọi", "data-admin-composer-action"]:
    assert needle in low, f"missing Admin composer action contract: {needle}"

for forbidden in [
    "tạo đơn", "đơn tạm", "đã giao", "công nợ", "data-admin-order-action",
    "tách nhanh", "ai ghi đơn", "v21-order-scribe", "data-order-mode",
    "selectedchattext", "capturechatselection", "selectionchange",
]:
    assert forbidden not in low, f"legacy Chat order/split behavior remains: {forbidden}"

assert "v21quoteclient" in low
assert "v21syncengine" not in quote_low
assert "queuetext" not in quote_low
assert "sendquotelink" not in quote_low
assert "queuetext" in low or "v21messagestore" in low
assert "contactid" in low
quote_overlay_css = actions_css.lower().split(".admin-composer-quote-overlay", 1)[1].split("}", 1)[0]
assert "pointer-events:auto" in quote_overlay_css
assert "v21interactioncontroller" in low
assert "enter?.(" in compact and "lockbaseui:true" in compact
assert "admin-quote-modal" in low
assert "exit?.(" in compact
assert "taphoacallinviteclient" in low
assert "createandsend" in low and "contactid" in low
assert "v21_call_start" not in low
assert "[data-quote-admin-block]" in actions_css
assert "[data-call-invite-admin-block]" in actions_css
assert "display:none!important" in actions_css.lower()
assert "node.remove()" not in low
assert "new mutationobserver(schedulelegacysuppression)" not in low
assert 'data-build-source="quote-client.js"' in source
assert 'data-build-source="admin-composer-actions.js"' in source
assert "import('./quote-client.js')" not in directory
assert "import('./admin-composer-actions.js')" not in quote
assert "action:'credentials'" in actions
assert 'Gửi thông tin' in actions
assert 'Để trống = dùng mật khẩu cũ' in actions
assert 'Đặt mật khẩu & gửi' not in actions
assert 'account-credentials-send' in actions
subprocess.run(["node", "--check", str(ACTIONS)], check=True)
print("chat quote + Admin composer actions contract PASS")
