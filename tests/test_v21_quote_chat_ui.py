from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "quote-client.js"
ACTIONS = ROOT / "admin-composer-actions.js"
CALL_CLIENT = ROOT / "call-invite-client.js"
SOURCE = ROOT / "index.source.html"

assert CLIENT.exists(), "quotation client module must exist"
assert CALL_CLIENT.exists(), "call invite client module must exist"
assert ACTIONS.exists(), "Admin composer actions module must exist"
assert SOURCE.exists(), "canonical source must exist"

quote = CLIENT.read_text(encoding="utf-8")
actions = ACTIONS.read_text(encoding="utf-8")
call = CALL_CLIENT.read_text(encoding="utf-8")
source = SOURCE.read_text(encoding="utf-8")
low = actions.lower()

# Composer + remains the single owner for Admin send/actions.
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

# Quote keeps its existing backend, but composer passes the active contact explicitly.
assert "functions.invoke('v21-quote'" in quote or 'functions.invoke("v21-quote"' in quote
assert "sendquotelink" in low and "contactid" in low
assert "v21quoteclient" in low

# Guest call link uses the existing invite client and never the normal Chat call start RPC.
assert "taphoacallinviteclient" in low
assert "createandsend" in low and "contactid" in low
assert "v21_call_start" not in low

# Future order entries are visible placeholders only; no order business logic is wired yet.
assert "disabled" in low
assert "sắp có" in low

# Old contact-profile entry points stay disabled so there is only one visible owner.
assert "PROFILE_QUOTE_ACTION_ENABLED=false" in quote
assert "PROFILE_CALL_INVITE_ACTION_ENABLED=false" in call

# Canonical source loads the Admin composer adapter after call invite support.
call_pos = source.find('./call-invite-client.js')
actions_pos = source.find('./admin-composer-actions.js')
assert call_pos >= 0
assert actions_pos > call_pos

print("chat Admin composer actions contract PASS")
