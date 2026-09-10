from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "work-auth-bridge.js"
SOURCE = (ROOT / "index.source.html").read_text(encoding="utf-8")


class WorkAuthBridgeContractTest(unittest.TestCase):
    def test_work_auth_bridge_module_is_loaded_by_canonical_source(self):
        self.assertTrue(BRIDGE.exists(), "work-auth-bridge.js must exist")
        self.assertIn('src="./work-auth-bridge.js', SOURCE)

    def test_bridge_targets_exact_getlink_origin_and_never_wildcard(self):
        code = BRIDGE.read_text(encoding="utf-8")
        self.assertIn('https://get.taphoa.xyz', code)
        self.assertIn('taphoa-auth-context', code)
        self.assertNotIn("postMessage(payload,'*')", code)
        self.assertNotIn('postMessage(payload,"*")', code)
        self.assertIn('postMessage(payload,GETLINK_ORIGIN)', code)

    def test_bridge_sends_access_token_and_account_but_not_refresh_token(self):
        code = BRIDGE.read_text(encoding="utf-8")
        self.assertIn('V21AuthSessionStore', code)
        self.assertIn('getSession()', code)
        self.assertIn('accessToken', code)
        self.assertIn('account', code)
        self.assertNotIn('refresh_token', code)
        self.assertNotIn('refreshToken', code)

    def test_bridge_refreshes_on_iframe_load_and_auth_token_refresh(self):
        code = BRIDGE.read_text(encoding="utf-8")
        self.assertIn('workGetlinkFrame', code)
        self.assertIn('addEventListener("load"', code)
        self.assertIn('v21-auth-token-refreshed', code)
        self.assertIn('v21-auth-state', code)


if __name__ == "__main__":
    unittest.main()
