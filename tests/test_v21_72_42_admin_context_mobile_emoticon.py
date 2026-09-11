from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
shell=read("shell.js")
app=read("app.js")
directory=read("contact-directory-admin.js")

# Directory list owns a visible, narrow scrollbar while tools/footer stay outside it.
assert "scrollbar-width:thin" in source
assert ".wm-sidebar-navigation::-webkit-scrollbar{width:3px}" in source

# Authenticated mobile footer stays one compact row; logout is icon-only.
assert "grid-template-columns:minmax(0,1fr) minmax(0,1fr) 42px" in source
assert "shell-sidebar-logout-icon" in source
assert '[data-state="authenticated"] .shell-sidebar-account-action [data-account-action-label]{display:none}' in source

# Admin chat context is explicit in the header, but normal users stay unchanged.
assert "data-active-contact-context" in source
assert "function renderActiveContactContext()" in shell
assert "authAccount?.role==='admin'" in shell
assert "route==='chat'" in shell
assert "activeContact?.id" in shell
assert "Đang chat ·" in shell

# Emoticons are a display-only transform. Raw message data/link href stay untouched.
assert "function normalizeDisplayEmoticons(value)" in app
for token, emoji in [(":)","🙂"),(":D","😄"),(";)","😉"),(":(","🙁"),(":P","😛"),(":~","😅")]:
    assert token in app and emoji in app
assert "document.createTextNode(normalizeDisplayEmoticons(text.slice(cursor,start)))" in app
assert "link.href=href;" in app
assert "link.textContent=href;" in app

print("V21.72.42 admin context/mobile footer/emoticon contract PASS")
