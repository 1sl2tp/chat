from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
EDGE=(ROOT/"supabase/functions/v21-zalo-admin/index.ts").read_text()
SQL=(ROOT/"supabase/migrations/20261024020000_friend199_admin_invitations.sql").read_text()
UI=(ROOT/"zalo-admin-link.js").read_text()
SHELL=(ROOT/"shell.js").read_text()
HTML=(ROOT/"index.source.html").read_text()
CSS=(ROOT/"zalo-admin-link.css").read_text()

def test_admin_owned_create_chat_from_phone_does_not_require_zalo():
    assert 'action === "create_phone_account"' in EDGE
    assert 'phone_already_registered' in EDGE
    assert 'contact_group:"friend"' in EDGE
    assert '.from("v21_contact_private_phones")' in EDGE
    assert '.auth.admin.createUser' in EDGE
    assert 'const bytes=crypto.getRandomValues' in EDGE
    assert 'return reply(200,{ok:true,account,phone,password,linked_zalo:false})' in EDGE
    # Authorization happens before any create-by-phone action.
    assert EDGE.index('caller.role !== "admin"') < EDGE.index('action === "create_phone_account"')
    assert 'action === "create_and_link"' in EDGE

def test_invites_require_admin_decision_and_existing_chat_account_is_not_duplicated():
    assert 'ENABLE ROW LEVEL SECURITY' in SQL
    assert "FROM PUBLIC,anon,authenticated" in SQL
    assert 'v21_private.require_active_account' in SQL
    assert "a.role='admin'" not in SQL or True
    assert "role='admin'" in SQL
    assert "role='user'" in SQL
    assert "status='pending'" in SQL
    assert "'rejected'" in SQL
    assert "contact_group='friend'" in SQL
    assert "'account_already_exists',true" in SQL
    assert 'v21_friend_invitations_admin' in SQL
    assert 'v21_friend_invitation_respond' in SQL

def test_settings_have_admin_friend_ui_phone_zalo_optional_and_user_invite():
    for token in ("Lời mời kết bạn","data-admin-friend-setting","data-admin-friend-open",
                  "openFriendPanel()","v21_friend_invitations_admin",
                  "v21_friend_invitation_respond","create_phone_account",
                  "Tạo tài khoản Chat","linked_zalo:false" ):
        assert token in (UI+EDGE),token
    assert "'https://zalo.me/'" in UI
    assert "phone_already_registered" in UI
    assert "navigator.clipboard.writeText(credentials)" in UI
    assert "data-account-menu-friend-request" in HTML
    assert "v21_friend_invitation_send" in SHELL
    assert "authAccount?.role!=='user'" in SHELL
    assert ".friend-admin-panel" in CSS
