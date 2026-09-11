from pathlib import Path

SQL = (Path(__file__).parents[1] / "supabase/migrations/20260911_zalo_user_link_bridge.sql").read_text("utf-8")


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
