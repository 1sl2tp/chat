from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_directory_reorders_contacts_by_latest_activity_and_exposes_search_filters():
    module_path = ROOT / "contact-directory-admin.js"
    assert module_path.exists(), "contact-directory-admin.js is required"
    module = module_path.read_text("utf-8")
    for token in [
        "function sortDirectoryContacts",
        "latest_at",
        "data-contact-directory-search",
        "data-contact-directory-filter",
        "Tất cả",
        "KH",
        "Bạn bè",
        "Khác",
        "v21-contact-store-change",
    ]:
        assert token in module, token

    loader = (ROOT / "zalo-admin-link.js").read_text("utf-8")
    assert "contact-directory-admin.js" in loader


def test_directory_activity_refresh_scrolls_to_latest_contact_while_manual_filter_keeps_position():
    module = (ROOT / "contact-directory-admin.js").read_text("utf-8")

    # Contact-store activity means a newer conversation can move to row 1.
    # The directory viewport must follow that reorder to the top instead of
    # restoring the stale scrollTop that hid the latest conversation.
    assert "function syncDirectoryRows({scrollToTop=false}={})" in module
    assert "scrollHost.scrollTop=scrollToTop?0:previousScrollTop" in module
    assert "function scheduleSync({scrollToTop=false}={})" in module
    assert "syncDirectoryRows({scrollToTop})" in module
    assert "document.addEventListener('v21-contact-store-change',()=>scheduleSync({scrollToTop:true}))" in module

    # Search/filter changes are user-owned navigation inside the directory and
    # must not force a jump to the top.
    assert "input.addEventListener('input',()=>{query=String(input.value||'');syncDirectoryRows();})" in module
    assert "syncDirectoryRows();" in module


def test_group_editing_exists_only_in_zalo_account_admin_popup():
    module = (ROOT / "contact-directory-admin.js").read_text("utf-8")
    for token in [
        "action:'set_group'",
        "contact_group",
        "customer",
        "friend",
        "other",
        "data-zalo-account-admin-modal",
    ]:
        assert token in module, token

    assert "data-contact-group-edit" not in (ROOT / "shell.js").read_text("utf-8")


def test_contact_group_schema_and_admin_backend_contract():
    migration = ROOT / "supabase/migrations/20260911_contact_directory_groups.sql"
    assert migration.exists(), "contact-directory group migration is required"
    sql = migration.read_text("utf-8").lower()
    for token in [
        "contact_group",
        "customer",
        "friend",
        "other",
        "check",
    ]:
        assert token in sql, token

    edge = (ROOT / "supabase/functions/v21-zalo-admin/index.ts").read_text("utf-8").lower()
    for token in [
        'action === "directory_groups"',
        'action === "set_group"',
        "contact_group",
        "customer",
        "friend",
        "other",
    ]:
        assert token in edge, token
