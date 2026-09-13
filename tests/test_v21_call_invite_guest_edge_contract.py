from pathlib import Path

EDGE = Path('supabase/functions/v21-call-invite-guest/index.ts')


def test_guest_call_invite_edge_contract():
    text = EDGE.read_text() if EDGE.exists() else ''
    compact = ''.join(text.split())

    required = [
        'SUPABASE_SERVICE_ROLE_KEY',
        'LIVEKIT_API_KEY',
        'LIVEKIT_API_SECRET',
        'npm:livekit-server-sdk',
        'hashInviteKey',
        ".eq('key_hash',keyHash)",
        "action==='open'",
        "action==='join'",
        "action==='connected'",
        'opened_at',
        'guest_joined_at',
        "identity:`guest:${String(invite.id)}`",
        "newAccessToken",
        "ttl:'10m'",
        'TrackSource.MICROPHONE',
        'canPublishData:false',
        "invalid_or_expired",
    ]
    for needle in required:
        assert needle.replace(' ', '') in compact, needle

    forbidden = [
        'auth.getUser',
        'authorization_required',
        'body?.roomName',
        'body?.room_name',
        'body?.participantIdentity',
        'body?.identity',
        'v21_call_start',
    ]
    for needle in forbidden:
        assert needle not in text, needle

    assert 'authorization, x-client-info, apikey, content-type' in text.lower()
    assert "roomJoin:true" in compact
    assert "canSubscribe:true" in compact
    assert "canPublish:true" in compact


def test_guest_open_does_not_return_room_or_token():
    text = EDGE.read_text() if EDGE.exists() else ''
    open_start = text.find("action==='open'")
    join_start = text.find("action==='join'")
    assert open_start >= 0 and join_start > open_start
    open_slice = text[open_start:join_start]
    assert 'participantToken' not in open_slice
    assert 'room_name' not in open_slice
    assert 'serverUrl' not in open_slice
    assert 'expiresAt' in open_slice
