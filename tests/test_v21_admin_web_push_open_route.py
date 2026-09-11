from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_admin_push_open_route_and_logout_cleanup_contract():
    controller=(ROOT/'admin-push-controller.js').read_text('utf-8')
    shell=(ROOT/'shell.js').read_text('utf-8')
    sw=(ROOT/'sw.js').read_text('utf-8')
    auth=(ROOT/'auth-session-store.js').read_text('utf-8')

    # Contact selection/navigation stays owned by Shell; push only supplies the target hint.
    for token in [
        'openContact(contactId',
        'if(!item)return false',
        'setActiveContact(id,name)',
        "this.open('chat')",
    ]:
        assert token in shell, token

    # Existing-window click, cold-open query and auth/contact-delayed routing converge on one handler.
    for token in [
        'ADMIN_PUSH_OPEN',
        'ADMIN_PUSH_CLEAR',
        'push_contact',
        'push_conversation',
        'history.replaceState',
        'NavigationCommand?.openContact',
        "navigator.serviceWorker?.addEventListener('message'",
        "document.addEventListener('v21-auth-state'",
        "document.addEventListener('v21-contact-store-change'",
        "document.addEventListener('visibilitychange'",
        "window.addEventListener('focus'",
        "window.addEventListener('blur'",
        "document.addEventListener('navigation-change'",
        "document.addEventListener('v21-active-contact-change'",
        "document.addEventListener('v21-conversation-context'",
    ]:
        assert token in controller, token

    # Logout/revoke removes the Admin push subscription best-effort before auth/client context is cleared.
    assert auth.count("V21AdminPush?.disable?.({bestEffort:true})") >= 2
    revoked_start=auth.index('async function handleRevoked')
    logout_start=auth.index('async function logout')
    assert auth.index("V21AdminPush?.disable?.({bestEffort:true})",revoked_start) < auth.index("client?.auth?.signOut",revoked_start)
    assert auth.index("V21AdminPush?.disable?.({bestEffort:true})",logout_start) < auth.index("client.auth.signOut",logout_start)

    # Signed-out/non-admin clients must not leave stale foreground suppression state in the SW.
    assert "event.data?.type==='ADMIN_PUSH_CLEAR'" in sw
    assert 'adminPushClientState.delete(event.source.id)' in sw
    assert 'clearAdminPushBadge()' in sw

    # Push remains secondary; controller must not bypass canonical SyncEngine transport/hydration.
    for forbidden in ['v21_message_send', 'v21_message_snapshot', 'v21_messages', 'v21_media_assets']:
        assert forbidden not in controller, forbidden
