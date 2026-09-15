from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUSH = (ROOT / 'admin-push-controller.js').read_text(encoding='utf-8')
CSS = (ROOT / 'zalo-admin-link.css').read_text(encoding='utf-8')


def compact(value: str) -> str:
    return ''.join(value.split())


def test_notification_intent_is_persistent_per_device_and_reconciled():
    assert "taphoa.v21.adminPushWanted" in PUSH, 'missing stable device notification intent key'
    assert "localStorage.getItem" in PUSH and "localStorage.setItem" in PUSH, 'notification intent must survive version reloads'
    assert "function notificationWanted" in PUSH, 'missing persistent intent reader'
    assert "function setNotificationWanted" in PUSH, 'missing persistent intent writer'
    assert "async function reconcileWantedSubscription" in PUSH, 'missing automatic rebind owner'
    assert "Notification.permission||'default'" in PUSH, 'rebind must respect browser permission'
    assert "permission!=='granted'" in PUSH, 'automatic rebind must not prompt for permission'
    assert "setNotificationWanted(true)" in PUSH, 'explicit enable must persist wanted=true'
    assert "setNotificationWanted(false)" in PUSH, 'explicit disable must persist wanted=false'
    assert "reconcileWantedSubscription" in PUSH.split("function onAuthState", 1)[1], 'authenticated boot/auth transition must reconcile wanted push state'


def test_mobile_account_rows_keep_people_side_by_side_and_actions_below():
    css = compact(CSS)
    assert '@media(max-width:640px)' in css
    assert '.zalo-account-row{grid-template-columns:minmax(0,1fr)minmax(0,1fr)auto;' in css, 'mobile account row should keep Chat and Zalo side by side with the compact group control'
    assert '.zalo-account-row-actions{grid-column:1/-1;' in css, 'mobile actions should occupy a compact second row'
    assert '.zalo-account-person-copystrong' in css and 'text-overflow:ellipsis' in css, 'long names must ellipsize instead of breaking layout'


if __name__ == '__main__':
    test_notification_intent_is_persistent_per_device_and_reconciled()
    test_mobile_account_rows_keep_people_side_by_side_and_actions_below()
    print('PASS: admin push device persistence + compact mobile account rows')
