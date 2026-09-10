from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "index.source.html"
INDEX = ROOT / "index.html"
SHELL = ROOT / "shell.js"
BRIDGE = ROOT / "getlink-auth-bridge.js"


class GetlinkWorkEmbedContract(unittest.TestCase):
    def test_chat_has_work_tab_and_getlink_iframe_in_source_and_build(self):
        for path in (SOURCE, INDEX):
            text = path.read_text(encoding="utf-8")
            self.assertIn('data-top-tab="work"', text, str(path))
            self.assertIn('data-nav-target="work"', text, str(path))
            self.assertIn('id="workThreadView"', text, str(path))
            self.assertIn('id="workGetlinkFrame"', text, str(path))
            self.assertIn('src="https://get.taphoa.xyz/?embed=1"', text, str(path))
            self.assertIn("getlink-auth-bridge.js", text, str(path))

    def test_shell_supports_work_without_changing_chat_default(self):
        text = SHELL.read_text(encoding="utf-8")
        self.assertIn("const ROUTES=Object.freeze(['chat','work']);", text)
        self.assertIn("let route='chat';", text)
        self.assertIn("openWork(){return this.open('work')}", text)
        self.assertIn("if(workView)workView.hidden=route!=='work';", text)

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
