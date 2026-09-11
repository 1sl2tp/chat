from pathlib import Path

PATH = Path(__file__).parents[1] / "supabase/functions/v21-zalo-session/index.ts"


def test_zalo_session_edge_uses_custom_bridge_token_and_service_role():
    assert PATH.exists(), "missing v21-zalo-session edge function"
    code = PATH.read_text("utf-8").lower()
    required = [
        "x-bridge-token",
        "v21_zalo_bridge_auth",
        "v21_zalo_bridge_session",
        "supabase_service_role_key",
        "crypto.subtle.digest",
        "credentials",
    ]
    for token in required:
        assert token in code, token
