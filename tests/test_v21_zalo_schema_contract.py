from pathlib import Path

ROOT = Path(__file__).parents[1]
SQL = (ROOT / "supabase/migrations/20260911_zalo_user_link_bridge.sql").read_text("utf-8")
ADMIN_API = ROOT / "supabase/functions/v21-zalo-admin/index.ts"


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
