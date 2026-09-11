from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_admin_push_controller_is_canonical_and_owns_permission():
    source=(ROOT/'index.source.html').read_text('utf-8')
    controller_path=ROOT/'admin-push-controller.js'
    assert controller_path.exists(), 'admin-push-controller.js is required'
    controller=controller_path.read_text('utf-8')
    zalo=(ROOT/'zalo-admin-link.js').read_text('utf-8')
    sync=(ROOT/'v21-sync-engine.js').read_text('utf-8')

    assert '<script src="./admin-push-controller.js" data-build-source="admin-push-controller.js"></script>' in source
    for token in ['V21AdminPush','Notification.requestPermission','pushManager.subscribe','v21-admin-push','ADMIN_PUSH_STATE']:
        assert token in controller, token
    assert 'Notification.requestPermission' not in zalo
    for forbidden in ['PushManager','Notification.requestPermission','v21-admin-push','showNotification']:
        assert forbidden not in sync, forbidden


def test_admin_push_setting_lives_inside_existing_zalo_account_popup():
    module=(ROOT/'zalo-admin-link.js').read_text('utf-8')
    css=(ROOT/'zalo-admin-link.css').read_text('utf-8')
    for token in [
        'data-admin-push-setting',
        'data-admin-push-status',
        'data-admin-push-action',
        'Thông báo',
        'Bật thông báo',
        'Đã bật thông báo',
        'Thông báo bị chặn',
        'Thiết bị này không hỗ trợ',
        'Cài TAPHOA Chat ra Màn hình chính để nhận thông báo nền',
        'window.V21AdminPush',
        '.status()',
        '.enable()',
        '.disable()',
    ]:
        assert token in module, token
    assert '.zalo-account-notification' in css
    assert 'Notification.requestPermission' not in module
