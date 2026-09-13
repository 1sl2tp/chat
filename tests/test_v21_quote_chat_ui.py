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
quote_low = quote.lower()
directory_low = directory.lower()

# Preserve the existing quotation contract.
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
    "masan",
    "sua",
    "thuoc-la",
    "v21-quote",
    "navigator.clipboard",
    "v21syncengine",
    "queuetext",
]:
    assert needle in quote_low, f"missing quotation Chat UI contract: {needle}"

assert "import('./quote-client.js')" in directory or 'import("./quote-client.js")' in directory, "loaded Admin module must import quotation UI"
for forbidden in ["v21-zalo-", "zalo.me", "openapi.zalo", "zalo api"]:
    assert forbidden not in quote_low, f"quotation UI must never send directly to Zalo: {forbidden}"
assert "functions.invoke('v21-quote'" in quote_low or 'functions.invoke("v21-quote"' in quote_low
assert "contactid:targetaccountid" in quote_low.replace(" ", ""), "legacy quotation send must still target its selected contact"

# Composer + is the single visible owner for Admin send/actions.
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

# Composer quote keeps the existing quote creator, but sends explicitly to the active chat contact.
assert "v21quoteclient" in low
assert "queuetext" in low or "v21messagestore" in low
assert "contactid" in low

# Guest call link reuses the existing invite client and never starts a normal Chat call.
assert "taphoacallinviteclient" in low
assert "createandsend" in low and "contactid" in low
assert "v21_call_start" not in low

# Future order entries are visible placeholders only; no order business logic is wired yet.
assert "disabled" in low
assert "sắp có" in low

# Old profile quote/call blocks are suppressed so the composer + is the only visible entry point.
assert "[data-quote-admin-block]" in actions
assert "[data-call-invite-admin-block]" in actions
assert ".remove()" in actions

# quote-client is already loaded by the Admin directory chain and bootstraps the composer adapter.
assert "import('./admin-composer-actions.js')" in quote or 'import("./admin-composer-actions.js")' in quote

# Catch syntax regressions in the external module that canonical inlining does not parse.
subprocess.run(["node", "--check", str(ACTIONS)], check=True)

print("chat quote + Admin composer actions contract PASS")
