from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_directory_reorders_contacts_by_latest_activity_and_exposes_search_filters():
    auth = (ROOT / "auth-session-store.js").read_text("utf-8")
    shell = (ROOT / "shell.js").read_text("utf-8")
    sync = (ROOT / "v21-sync-engine.js").read_text("utf-8")

    for token in [
        "function sortDirectoryContacts",
        "latest_at",
        "contact_group",
        "this.contacts=sortDirectoryContacts",
    ]:
        assert token in auth, token

    for token in [
        "data-contact-directory-search",
        "data-contact-directory-filter",
        "Tất cả",
        "KH",
        "Bạn bè",
        "Khác",
    ]:
        assert token in shell, token

    assert "contact_group:payload.contact_group" in sync


def test_group_editing_exists_only_in_zalo_account_admin_popup():
    module = (ROOT / "zalo-admin-link.js").read_text("utf-8")
    for token in [
        "action:'set_group'",
        "contact_group",
        "KH",
        "Bạn bè",
        "Khác",
    ]:
        assert token in module, token

    assert "data-contact-group-edit" not in (ROOT / "shell.js").read_text("utf-8")


def test_contact_group_schema_and_sidebar_contract():
    migration = ROOT / "supabase/migrations/20260911_contact_directory_groups.sql"
    assert migration.exists(), "contact-directory group migration is required"
    sql = migration.read_text("utf-8").lower()
    for token in [
        "contact_group",
        "customer",
        "friend",
        "other",
        "v21_contacts_sidebar",
        "latest_at",
    ]:
        assert token in sql, token

    edge = (ROOT / "supabase/functions/v21-zalo-admin/index.ts").read_text("utf-8").lower()
    for token in [
        'action === "set_group"',
        "contact_group",
        "customer",
        "friend",
        "other",
    ]:
        assert token in edge, token
