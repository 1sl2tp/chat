from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_zalo_link_is_admin_managed_profile_only():
    module_path = ROOT / "zalo-admin-link.js"
    css_path = ROOT / "zalo-admin-link.css"
    assert module_path.exists(), "zalo-admin-link.js is required"
    assert css_path.exists(), "zalo-admin-link.css is required"

    module = module_path.read_text("utf-8")
    source = (ROOT / "index.source.html").read_text("utf-8")
    sync_engine = (ROOT / "v21-sync-engine.js").read_text("utf-8").lower()

    for token in [
        "V21ZaloAdminLink",
        "Liên kết Zalo",
        "Bỏ liên kết",
        "v21-zalo-admin",
        "data-profile-admin-actions",
        "Đã gán",
    ]:
        assert token in module, token

    assert 'data-build-source="zalo-admin-link.css"' in source
    assert 'data-build-source="zalo-admin-link.js"' in source
    assert "zalo" not in sync_engine, "Zalo transport must not be added to SyncEngine"


def test_zalo_account_admin_is_one_simple_popup_inside_existing_module():
    module = (ROOT / "zalo-admin-link.js").read_text("utf-8")
    css = (ROOT / "zalo-admin-link.css").read_text("utf-8")
    source = (ROOT / "index.source.html").read_text("utf-8")

    for token in [
        "Zalo & tài khoản",
        "admin_snapshot",
        "create_and_link",
        "data-zalo-account-admin-open",
        "zaloAccountAdminModal",
        "Đã kết nối",
        "Chưa kết nối",
        "Zalo đã được gán",
        "Chưa có tài khoản Chat",
        "Tạo tài khoản",
        "Chọn Zalo",
        "Bỏ liên kết",
    ]:
        assert token in module, token

    assert 'data-build-source="zalo-admin-link.css"' in source
    assert 'data-build-source="zalo-admin-link.js"' in source
    assert "zalo-account-admin.js" not in source
    assert "zalo-account-admin.css" not in source
    assert "zalo-account-modal" in css
    assert "@media" in css and "max-width" in css


def test_zalo_picker_and_create_forms_use_nested_popup_not_bottom_scroll_panel():
    module = (ROOT / "zalo-admin-link.js").read_text("utf-8")
    css = (ROOT / "zalo-admin-link.css").read_text("utf-8")
    for token in [
        "zalo-account-submodal",
        "openAccountPicker",
        "openCreateAccount",
    ]:
        assert token in module, token
    assert ".zalo-account-submodal" in css
    assert "position:fixed" in css
