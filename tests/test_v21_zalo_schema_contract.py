from pathlib import Path

ROOT = Path(__file__).parents[1]
SQL = (ROOT / "supabase/migrations/20260911_zalo_user_link_bridge.sql").read_text("utf-8")
ADMIN_API = ROOT / "supabase/functions/v21-zalo-admin/index.ts"
SIGNAL_SQL = ROOT / "supabase/migrations/20260911_zalo_outbound_signal.sql"
MEDIA_SQL = ROOT / "supabase/migrations/20260911_zalo_media_bridge.sql"
MEDIA_API = ROOT / "supabase/functions/v21-zalo-bridge/index.ts"


def test_zalo_bridge_schema_and_security_contract():
    required = [
        "create table if not exists public.zalo_contacts",
        "create table if not exists public.zalo_user_links",
        "create table if not exists public.zalo_message_links",
        "unique (zalo_id)",
        "v21_zalo_admin_snapshot",
        "v21_zalo_admin_link",
        "v21_zalo_admin_unlink",
        "v21_zalo_contact_upsert",
        "v21_zalo_ingress",
        "v21_zalo_outbound_due",
        "v21_zalo_outbound_result",
        "enqueue_zalo_outbound",
        "revoke all on function",
        "grant execute on function",
    ]
    lower = SQL.lower()
    for token in required:
        assert token in lower, token
    assert "grant execute on function public.v21_zalo_ingress" in lower
    assert "to service_role" in lower


def test_zalo_media_bridge_uses_canonical_v21_media_and_media_only_outbound_trigger():
    assert MEDIA_SQL.exists(), "Zalo media bridge migration is required"
    sql = MEDIA_SQL.read_text("utf-8").lower()
    for token in [
        "v21_zalo_media_target",
        "v21_zalo_ingress_media",
        "v21_media_assets",
        "enqueue_zalo_media_outbound",
        "v21_media_assets_enqueue_zalo_outbound_trg",
        "revoke all on function",
        "grant execute on function",
        "to service_role",
    ]:
        assert token in sql, token


def test_zalo_bridge_edge_function_accepts_multipart_media_and_signs_outbound_assets():
    assert MEDIA_API.exists(), "v21-zalo-bridge Edge Function is required"
    source = MEDIA_API.read_text("utf-8").lower()
    for token in [
        "multipart/form-data",
        "ingress_media",
        "v21_zalo_media_target",
        "v21_zalo_ingress_media",
        "v21-media",
        "createsignedurl",
        "media",
    ]:
        assert token in source, token


def test_admin_zalo_link_api_contract():
    assert ADMIN_API.exists(), "v21-zalo-admin Edge Function is required"
    source = ADMIN_API.read_text("utf-8").lower()
    for token in [
        "auth.getuser",
        "v21_accounts",
        "admin_required",
        "v21_zalo_admin_snapshot",
        "v21_zalo_admin_link",
        "v21_zalo_admin_unlink",
        "snapshot",
        "link",
        "unlink",
    ]:
        assert token in source, token


def test_zalo_outbound_is_signaled_immediately_with_night_quiet_hours():
    assert SIGNAL_SQL.exists(), "outbound signal migration is required"
    sql = SIGNAL_SQL.read_text("utf-8").lower()
    for token in [
        "net.http_post",
        "asia/ho_chi_minh",
        "05:00",
        "zalo_outbound_signal",
        "v21_zalo_bridge_auth",
        "token_sha256",
        "https://taphoa-zalo-login.onrender.com/outbound-now",
        "x-bridge-token-sha256",
    ]:
        assert token in sql, token
