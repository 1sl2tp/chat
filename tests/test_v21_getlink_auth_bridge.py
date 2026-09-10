from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
AUTH = ROOT / "auth-session-store.js"


class GetlinkAuthBridgeContract(unittest.TestCase):
    def text(self):
        return AUTH.read_text(encoding="utf-8")

    def test_bridge_targets_only_getlink_origin(self):
        text = self.text()
        self.assertIn("const GETLINK_ORIGIN='https://get.taphoa.xyz';", text)
        self.assertIn("getElementById('workGetlinkFrame')", text)
        self.assertIn("postMessage(payload,GETLINK_ORIGIN)", text)

    def test_bridge_sends_access_token_and_chat_account_only(self):
        text = self.text()
        self.assertIn("type:'taphoa-chat-auth'", text)
        self.assertIn("accessToken", text)
        self.assertIn("account:account?{...account}:null", text)
        self.assertNotIn("refresh_token", text)
        self.assertNotIn("refreshToken", text)

    def test_bridge_syncs_on_authenticated_render_and_token_refresh(self):
        text = self.text()
        self.assertIn("syncGetlinkAuthBridge", text)
        self.assertIn("renderAuthenticated", text)
        self.assertIn("TOKEN_REFRESHED", text)
        self.assertGreaterEqual(text.count("syncGetlinkAuthBridge"), 3)

    def test_guest_state_clears_getlink_auth(self):
        text = self.text()
        self.assertIn("accessToken:null", text)
        self.assertIn("renderGuest", text)


if __name__ == '__main__':
    unittest.main()
