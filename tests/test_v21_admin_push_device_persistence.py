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


def test_mobile_account_rows_separate_chat_zalo_and_actions():
    css = compact(CSS)
    assert '@media(max-width:640px)' in css
    assert '.zalo-account-row{grid-template-columns:minmax(0,1fr);align-items:stretch;' in css, 'narrow Settings rows must stack instead of squeezing Chat and Zalo names'
    assert '.zalo-account-person::before{content:"Chat"}' in css
    assert '.zalo-account-relation::before{content:"Zalo"}' in css
    assert '.zalo-account-row-actions{grid-column:1;justify-content:flex-start;' in css, 'actions must have their own line'
    assert '.zalo-account-relation{padding-top:9px;border-top:' in css, 'relation must remain visually separated'
    assert '.zalo-account-person-copystrong{white-space:normal;overflow-wrap:anywhere;' in css, 'long names must wrap without overlapping other accounts'
    assert '.zalo-account-preferences.zalo-account-notification{flex:none;display:grid;' in css, 'preferences must not shrink rows into one another'


if __name__ == '__main__':
    test_notification_intent_is_persistent_per_device_and_reconciled()
    test_mobile_account_rows_separate_chat_zalo_and_actions()
    print('PASS: admin push device persistence + non-overlapping mobile account settings')
