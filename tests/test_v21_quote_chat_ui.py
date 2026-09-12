from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "quote-client.js"
DIRECTORY = ROOT / "contact-directory-admin.js"

assert CLIENT.exists(), "quotation UI/client module must exist"
assert DIRECTORY.exists(), "contact directory admin module must exist"

src = CLIENT.read_text(encoding="utf-8")
low = src.lower()
directory = DIRECTORY.read_text(encoding="utf-8").lower()

required = [
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
]
for needle in required:
    assert needle in low, f"missing quotation Chat UI contract: {needle}"

assert "import('./quote-client.js')" in directory or 'import("./quote-client.js")' in directory, "loaded Admin module must import quotation UI"

for forbidden in [
    "v21-zalo-",
    "zalo.me",
    "openapi.zalo",
    "zalo api",
]:
    assert forbidden not in low, f"quotation UI must never send directly to Zalo: {forbidden}"

assert "functions.invoke('v21-quote'" in low or 'functions.invoke("v21-quote"' in low, "quotation creation must use dedicated Edge Function"
assert "contactid:targetaccountid" in low.replace(" ", ""), "quotation send must target the User whose ellipsis opened the modal"

print("chat quote Admin UI contract PASS")
