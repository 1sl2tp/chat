from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "getlink-auth-bridge.js"
SOURCE = ROOT / "index.source.html"


class GetlinkAuthBridgeContract(unittest.TestCase):
    def text(self):
        self.assertTrue(BRIDGE.exists(), "GETLINK auth bridge module must exist")
        return BRIDGE.read_text(encoding="utf-8")

    def test_bridge_targets_only_getlink_origin(self):
        text = self.text()
        self.assertIn("const GETLINK_ORIGIN='https://get.taphoa.xyz';", text)
        self.assertIn("getElementById('workGetlinkFrame')", text)
        self.assertIn("postMessage(message,GETLINK_ORIGIN)", text)
        self.assertIn("event.origin!==GETLINK_ORIGIN", text)

    def test_bridge_sends_access_token_and_chat_account_only(self):
        text = self.text()
        self.assertIn("type:'taphoa-chat-auth'", text)
        self.assertIn("accessToken", text)
        self.assertIn("account:account?{...account}:null", text)
        self.assertNotIn("refresh_token", text)
        self.assertNotIn("refreshToken", text)

    def test_bridge_syncs_on_auth_state_and_token_refresh(self):
        text = self.text()
        self.assertIn("syncGetlinkAuthBridge", text)
        self.assertIn("v21-auth-state", text)
        self.assertIn("v21-auth-token-refreshed", text)
        self.assertIn("taphoa-getlink-auth-request", text)
        self.assertGreaterEqual(text.count("syncGetlinkAuthBridge"), 3)

    def test_guest_state_clears_getlink_auth(self):
        text = self.text()
        self.assertIn("accessToken:null", text)
        self.assertIn("snapshot.state!=='AUTHENTICATED'", text)

    def test_canonical_source_loads_bridge_after_auth_store(self):
        source = SOURCE.read_text(encoding="utf-8")
        auth = source.index('auth-session-store.js')
        bridge = source.index('getlink-auth-bridge.js')
        self.assertGreater(bridge, auth)


if __name__ == '__main__':
    unittest.main()
