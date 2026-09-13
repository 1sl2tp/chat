from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "quote-client.js"
ACTIONS = ROOT / "admin-composer-actions.js"
CALL_CLIENT = ROOT / "call-invite-client.js"
LOADER = ROOT / "app-update-controller.js"

assert CLIENT.exists(), "quotation client module must exist"
assert CALL_CLIENT.exists(), "call invite client module must exist"
assert ACTIONS.exists(), "Admin composer actions module must exist"
assert LOADER.exists(), "runtime loader must exist"

quote = CLIENT.read_text(encoding="utf-8")
actions = ACTIONS.read_text(encoding="utf-8")
call = CALL_CLIENT.read_text(encoding="utf-8")
loader = LOADER.read_text(encoding="utf-8")
low = actions.lower()

# Composer + remains the single visible owner for Admin send/actions.
for needle in [
    "role==='admin'",
    "báo giá",
    "link gọi",
    "đơn",
    "tạo đơn",
    "đơn tạm",
    "đã giao",
    "công nợ",
    "data-admin-composer-action",
    "data-admin-order-action",
]:
    assert needle in low, f"missing Admin composer action contract: {needle}"

# Quote keeps its existing backend; composer creates the quote and sends to the active contact.
assert "functions.invoke('v21-quote'" in quote or 'functions.invoke("v21-quote"' in quote
assert "v21quoteclient" in low
assert "queuetext" in low or "v21messagestore" in low
assert "contactid" in low

# Guest call link reuses the existing invite client and never the normal Chat call start RPC.
assert "taphoacallinviteclient" in low
assert "createandsend" in low and "contactid" in low
assert "v21_call_start" not in low

# Future order entries are visible placeholders only; no order business logic is wired yet.
assert "disabled" in low
assert "sắp có" in low

# Legacy profile blocks are actively suppressed so the composer + is the only visible entry point.
assert "[data-quote-admin-block]" in actions
assert "[data-call-invite-admin-block]" in actions
assert ".remove()" in actions

# The already-loaded final runtime module bootstraps the new composer adapter.
assert "import('./admin-composer-actions.js')" in loader or 'import("./admin-composer-actions.js")' in loader

print("chat Admin composer actions contract PASS")
