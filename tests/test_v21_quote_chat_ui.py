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
low = actions.lower()
compact = "".join(low.split())
quote_low = quote.lower()

# Preserve quotation flow.
for needle in [
    "role==='admin'", "báo giá", "tất cả", "theo nguồn",
    "v21-quote", "navigator.clipboard", "v21syncengine", "queuetext",
]:
    assert needle in quote_low, f"missing quotation Chat UI contract: {needle}"
assert "functions.invoke('v21-quote'" in quote_low or 'functions.invoke("v21-quote"' in quote_low

# Composer + now owns communication actions only.
for needle in ["role==='admin'", "báo giá", "link gọi", "data-admin-composer-action"]:
    assert needle in low, f"missing Admin composer action contract: {needle}"
for forbidden in [
    "tạo đơn", "đơn tạm", "tách nhanh", "ai ghi đơn", "v21-order-scribe",
    "data-order-mode", "v21adminordersource", "admin-order-draft.js",
]:
    assert forbidden not in low, f"legacy Chat order action still present: {forbidden}"

# Quote modal remains a real locked modal.
quote_overlay_css = low.split(".admin-composer-quote-overlay", 1)[1].split("}", 1)[0]
assert "pointer-events:auto" in quote_overlay_css
assert "v21interactioncontroller" in low
assert "enter?.(" in compact and "lockbaseui:true" in compact
assert "admin-quote-modal" in low
assert "exit?.(" in compact

# Guest call link reuses the existing invite client and never starts a normal Chat call.
assert "taphoacallinviteclient" in low
assert "createandsend" in low and "contactid" in low
assert "v21_call_start" not in low

# Existing profile quote/call blocks stay hidden to avoid their own mount loop.
assert "[data-quote-admin-block]" in actions
assert "[data-call-invite-admin-block]" in actions
assert "display:none!important" in low
assert "node.remove()" not in low

assert "import('./admin-composer-actions.js')" in quote or 'import("./admin-composer-actions.js")' in quote
subprocess.run(["node", "--check", str(ACTIONS)], check=True)
print("chat quote + Admin composer communication actions PASS")
