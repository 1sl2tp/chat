from pathlib import Path

EDGE = Path('supabase/functions/v21-call-invite-admin/index.ts')


def test_admin_call_invite_edge_contract():
    text = EDGE.read_text() if EDGE.exists() else ''
    compact = ''.join(text.split())

    required = [
        "npm:livekit-server-sdk",
        "SUPABASE_SERVICE_ROLE_KEY",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "auth.getUser",
        'v21_accounts',
        "role\",\"admin",
        "body?.contactId",
        "created_by_account_id:user.id",
        "PUBLIC_BASE='https://chat.taphoa.xyz/c/?k='",
        "newAccessToken",
        "ttl:'10m'",
        "TrackSource.MICROPHONE",
        "canPublishData:false",
        "action==='create'",
        "action==='join'",
        "action==='connected'",
        "action==='revoke'",
        "action==='end'",
    ]
    for needle in required:
        assert needle.replace(' ', '') in compact, needle

    forbidden = [
        'v21_call_start',
        'V21CallEngine',
        'body?.roomName',
        'body?.room_name',
        'body?.participantIdentity',
        'body?.identity',
    ]
    for needle in forbidden:
        assert needle not in text, needle

    assert 'authorization, x-client-info, apikey, content-type' in text.lower()
    assert "roomJoin:true" in compact
    assert "canSubscribe:true" in compact
    assert "canPublish:true" in compact


def test_admin_create_returns_only_public_invite_url_not_livekit_token():
    text = EDGE.read_text() if EDGE.exists() else ''
    create_start = text.find("action==='create'")
    join_start = text.find("action==='join'")
    assert create_start >= 0 and join_start > create_start
    create_slice = text[create_start:join_start]
    assert 'participantToken' not in create_slice
    assert 'LIVEKIT_API_SECRET' not in create_slice
    assert 'rawKey' in create_slice
    assert 'hashInviteKey(rawKey)' in create_slice
