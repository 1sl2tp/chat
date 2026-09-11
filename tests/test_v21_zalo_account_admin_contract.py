from pathlib import Path

ROOT = Path(__file__).parents[1]
EDGE = (ROOT / "supabase/functions/v21-zalo-admin/index.ts").read_text("utf-8")


def test_zalo_account_admin_backend_contract():
    lower = EDGE.lower()
    for token in [
        'action === "admin_snapshot"',
        'action === "create_and_link"',
        'auth.admin.createuser',
        'auth.admin.deleteuser',
        '.from("zalo_contacts")',
        '.from("zalo_user_links")',
        '.from("v21_accounts")',
        'v21_zalo_admin_link',
        'username_taken',
        'invalid_username',
        'invalid_display_name',
        'invalid_password',
        'zalo_already_linked',
    ]:
        assert token in lower, token

    assert 'select("id,username,display_name,role,avatar_path,locked_at")' in lower
    assert 'password:' not in lower.split('return reply(200')[-1]


def test_existing_profile_actions_are_preserved():
    lower = EDGE.lower()
    for token in ['action === "snapshot"', 'action === "link"', 'action === "unlink"']:
        assert token in lower, token


def test_link_syncs_zalo_avatar_url_to_chat_account():
    lower = EDGE.lower()
    assert 'select("avatar_url")' in lower
    assert '.update({ avatar_path: avatarurl })' in lower
