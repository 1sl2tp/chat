from pathlib import Path

CLIENT_PATH = Path('call-invite-client.js')
SOURCE_PATH = Path('index.source.html')
SESSION_PATH = Path('guest-call-session.js')


def test_admin_call_invite_ui_contract():
    client = CLIENT_PATH.read_text('utf-8') if CLIENT_PATH.exists() else ''
    source = SOURCE_PATH.read_text('utf-8') if SOURCE_PATH.exists() else ''
    session = SESSION_PATH.read_text('utf-8') if SESSION_PATH.exists() else ''

    assert client, 'call-invite-client.js missing'
    assert 'Gửi link gọi' in client
    assert 'v21-call-invite-admin' in client
    assert 'V21SyncEngine' in client or 'queueText' in client
    assert 'Gửi lại link' in client
    assert 'Khách đã mở link' in client
    assert 'Khách đã vào phòng' in client
    assert 'Tham gia' in client

    assert 'v21_call_start' not in client
    assert 'V21CallEngine.startOutgoing' not in client
    assert 'editor.value' not in client
    assert 'pendingAttachments' not in client

    create_start = client.find('async function createAndSend')
    join_start = client.find('async function joinInvite')
    assert create_start >= 0 and join_start > create_start
    create_send = client[create_start:join_start]
    assert 'functions.invoke' in create_send
    assert "action:'create'" in create_send
    assert 'queueText' in create_send or 'sendTextLink' in create_send
    assert 'getUserMedia' not in create_send
    assert 'joinAdmin' not in create_send
    assert 'participantToken' not in create_send

    assert 'joinAdmin' in session, 'Admin media join must be an explicit sibling session action'

    guest_script = source.find('./guest-call-session.js')
    client_script = source.find('./call-invite-client.js')
    assert guest_script >= 0, 'guest-call-session.js must load in Chat'
    assert client_script > guest_script, 'call-invite-client.js must load after guest-call-session.js'
