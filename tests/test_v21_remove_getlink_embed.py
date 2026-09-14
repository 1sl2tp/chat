from pathlib import Path
import unittest

# Work-first boot contract: keep Chat available, but never blank the mobile shell during startup.
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "index.source.html"
INDEX = ROOT / "index.html"
SHELL = ROOT / "shell.js"
BRIDGE = ROOT / "getlink-auth-bridge.js"


class GetlinkWorkEmbedContract(unittest.TestCase):
    def test_chat_boots_into_work_and_does_not_force_eager_iframe_load(self):
        for path in (SOURCE, INDEX):
            text = path.read_text(encoding="utf-8")
            compact = "".join(text.split())
            self.assertIn('data-default-route="work" data-route="work"', text, str(path))
            self.assertIn('data-top-tab="work"', text, str(path))
            self.assertIn('data-nav-target="work"', text, str(path))
            self.assertIn('aria-selected="true"data-top-tab="work"data-nav-target="work"', compact, str(path))
            self.assertIn('id="workThreadView"', text, str(path))
            self.assertIn('id="workGetlinkFrame"', text, str(path))
            self.assertIn('src="https://get.taphoa.xyz/?embed=1"', text, str(path))
            self.assertIn('loading="lazy"', text, str(path))
            self.assertNotIn('loading="eager"', text, str(path))
            self.assertIn("getlink-auth-bridge.js", text, str(path))

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

    def test_bridge_is_token_only_and_origin_locked(self):
        self.assertTrue(BRIDGE.exists())
        text = BRIDGE.read_text(encoding="utf-8")
        self.assertIn("const GETLINK_ORIGIN='https://get.taphoa.xyz';", text)
        self.assertIn("type:'taphoa-chat-auth'", text)
        self.assertIn("accessToken", text)
        self.assertIn("event.origin!==GETLINK_ORIGIN", text)
        self.assertIn("taphoa-getlink-auth-request", text)
        self.assertNotIn("account:snapshot.account", text)
        self.assertNotIn("account:account", text)
        self.assertNotIn("signInWithPassword", text)
        self.assertNotIn("username", text.lower())
        self.assertNotIn("password", text.lower())


if __name__ == "__main__":
    unittest.main()
