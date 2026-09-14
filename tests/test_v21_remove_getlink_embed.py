from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "index.source.html"
INDEX = ROOT / "index.html"
SHELL = ROOT / "shell.js"
BRIDGE = ROOT / "getlink-auth-bridge.js"


class ChatOwnedWorkSurfaceContract(unittest.TestCase):
    def test_chat_keeps_work_route_but_owns_the_surface(self):
        for path in (SOURCE, INDEX):
            text = path.read_text(encoding="utf-8")
            compact = "".join(text.split())
            self.assertIn('data-default-route="work" data-route="work"', text, str(path))
            self.assertIn('data-top-tab="work"', text, str(path))
            self.assertIn('data-nav-target="work"', text, str(path))
            self.assertIn('aria-selected="true"data-top-tab="work"data-nav-target="work"', compact, str(path))
            self.assertIn('id="workThreadView"', text, str(path))
            self.assertIn('data-work-owner="chat"', text, str(path))
            self.assertIn('Khu vực này để phát triển sau.', text, str(path))

    def test_getlink_is_not_embedded_or_owned_by_chat(self):
        for path in (SOURCE, INDEX):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn('id="workGetlinkFrame"', text, str(path))
            self.assertNotIn('data-work-frame-owner="getlink"', text, str(path))
            self.assertNotIn('https://get.taphoa.xyz/?embed=1', text, str(path))
            self.assertNotIn('?embed=1', text, str(path))
            self.assertNotIn('getlink-auth-bridge.js', text, str(path))
            self.assertNotIn('V21GetlinkAuthBridge', text, str(path))
            self.assertNotIn("type:'taphoa-chat-auth'", text, str(path))
        self.assertFalse(BRIDGE.exists(), "CHAT must not ship the GETLINK auth bridge")

    def test_shell_uses_work_as_default_route_but_keeps_chat_available(self):
        text = SHELL.read_text(encoding="utf-8")
        compact = "".join(text.split())
        self.assertIn("const ROUTES=Object.freeze(['chat','work']);", text)
        self.assertIn("let route='work';", text)
        self.assertIn("route=ROUTES.includes(saved?.route)?saved.route:'work';", compact)
        self.assertIn("openWork(){return this.open('work')}", text)
        self.assertIn("openChat(){return this.open('chat')}", text)
        self.assertIn("DESKTOP_WORKSPACE_QUERY", text)
        self.assertIn("desktopWorkspaceMedia", text)
        self.assertIn("dataset.desktopWorkspace", text)
        self.assertIn("desktopWorkspace?false:route!=='chat'", compact)
        self.assertIn("desktopWorkspace?false:route!=='work'", compact)
        self.assertNotIn("V21GetlinkAuthBridge", text)

    def test_static_work_route_can_render_before_shell_finishes_booting(self):
        for path in (SOURCE, INDEX):
            text = path.read_text(encoding="utf-8")
            compact = "".join(text.split())
            self.assertIn('#appShell[data-route="work"]#workThreadView', compact, str(path))
            self.assertIn('#appShell[data-route="work"][data-chat-thread-node]', compact, str(path))

    def test_desktop_is_directory_chat_work_while_mobile_keeps_route_switching(self):
        for path in (SOURCE, INDEX):
            text = path.read_text(encoding="utf-8")
            compact = "".join(text.split())
            self.assertIn("--desktop-work-width", text, str(path))
            self.assertIn('data-desktop-workspace="true"', text, str(path))
            self.assertIn('#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#workThreadView', compact, str(path))
            self.assertIn('#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#thread-bottom-container', compact, str(path))
            self.assertIn('[data-top-tab="work"]', text, str(path))


if __name__ == "__main__":
    unittest.main()
