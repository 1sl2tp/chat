from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text("utf-8")

source=read("index.source.html")
shell=read("shell.js")

# The chat tab owns active-contact identity for admins; there is no second
# context row competing for vertical space beneath the mode switch.
assert 'data-active-contact-context' not in source
assert 'data-chat-tab-avatar' in source
assert 'data-chat-tab-label' in source

# Runtime renders avatar + contact name only for authenticated admin/chat/contact.
assert 'function renderChatTabIdentity()' in shell
assert "authAccount?.role==='admin'" in shell
assert "route==='chat'" in shell
assert 'activeContact?.id' in shell
assert 'window.V21ContactStore?.snapshot?.()' in shell
assert 'renderAvatarNode(avatar,item' in shell

# Fallback remains the original tab label when identity is not applicable.
assert "label.textContent='Trò chuyện'" in shell
assert 'avatar.hidden=true' in shell

print('V21.72.44 contact tab identity contract PASS')
