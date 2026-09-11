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


def test_zalo_account_admin_settings_surface():
    module_path = ROOT / "zalo-account-admin.js"
    css_path = ROOT / "zalo-account-admin.css"
    assert module_path.exists(), "zalo-account-admin.js is required"
    assert css_path.exists(), "zalo-account-admin.css is required"

    module = module_path.read_text("utf-8")
    css = css_path.read_text("utf-8")
    source = (ROOT / "index.source.html").read_text("utf-8")
    for token in [
        "V21ZaloAccountAdmin",
        "Zalo & tài khoản",
        "admin_snapshot",
        "create_and_link",
        "Đã kết nối",
        "Chưa kết nối",
        "Zalo đã được gán",
        "Chưa có tài khoản Chat",
        "Tạo tài khoản",
        "Chọn Zalo",
        "Bỏ liên kết",
    ]:
        assert token in module, token

    assert 'data-build-source="zalo-account-admin.css"' in source
    assert 'data-build-source="zalo-account-admin.js"' in source
    assert "@media" in css and "max-width" in css
