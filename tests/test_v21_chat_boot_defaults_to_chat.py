"""Chat-first boot contract: existing routes/actions only, no new API/owner."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_boot_and_first_paint_chat():
    html = (ROOT / "index.source.html").read_text(encoding="utf-8")
    shell = (ROOT / "shell.js").read_text(encoding="utf-8")
    assert 'data-default-route="chat" data-route="chat"' in html
    assert 'aria-selected="true" data-top-tab="chat"' in html
    assert 'aria-selected="false" data-top-tab="work"' in html
    assert "let route='chat';" in shell
    assert "route='chat';" in shell.split("const ScreenSession=", 1)[1].split("clear(accountId=", 1)[0]

def test_restore_keeps_contact_not_work_route():
    shell = (ROOT / "shell.js").read_text(encoding="utf-8")
    block = shell.split("restore(account){", 1)[1].split("clear(accountId=", 1)[0]
    assert "route='chat';" in block
    assert "readScreenSession(accountId)" in block
    assert "activeContact=contact?.id?" in block
    assert "saved?.route" not in block
    assert "openWork(){return this.open('work')}" in shell

def test_guest_and_notification_open_chat():
    auth = (ROOT / "auth-session-store.js").read_text(encoding="utf-8")
    guest = auth.split("function renderGuest(){", 1)[1].split("function renderAuthenticated(", 1)[0]
    assert "NavigationCommand?.openChat?.()" in guest
    assert "NavigationCommand?.openWork?.()" not in guest
    shell = (ROOT / "shell.js").read_text(encoding="utf-8")
    push = (ROOT / "admin-push-controller.js").read_text(encoding="utf-8")
    assert "this.open('chat');" in shell.split("openContact(contactId,",1)[1]
    assert "NavigationCommand?.openContact?.(contactId)" in push

if __name__ == "__main__":
    test_boot_and_first_paint_chat()
    test_restore_keeps_contact_not_work_route()
    test_guest_and_notification_open_chat()
    print("Chat default route / notification contract PASS")
