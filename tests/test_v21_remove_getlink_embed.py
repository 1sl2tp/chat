from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.source.html"
SHELL = ROOT / "shell.js"
BRIDGE = ROOT / "getlink-auth-bridge.js"


class RemoveGetlinkEmbedContract(unittest.TestCase):
    def test_chat_source_has_no_getlink_iframe_or_bridge(self):
        text = INDEX.read_text(encoding="utf-8")
        self.assertNotIn("workGetlinkFrame", text)
        self.assertNotIn("https://get.taphoa.xyz", text)
        self.assertNotIn("getlink-auth-bridge.js", text)
        self.assertNotIn('data-top-tab="work"', text)
        self.assertNotIn('id="workThreadView"', text)

    def test_shell_is_chat_only_and_defaults_to_chat(self):
        text = SHELL.read_text(encoding="utf-8")
        self.assertIn("const ROUTES=Object.freeze(['chat']);", text)
        self.assertIn("let route='chat';", text)
        self.assertNotIn("openWork(){return this.open('work')}", text)
        self.assertNotIn("?'work'", text)
        self.assertNotIn(":'work'", text)

    def test_getlink_bridge_file_is_removed(self):
        self.assertFalse(BRIDGE.exists())


if __name__ == "__main__":
    unittest.main()
