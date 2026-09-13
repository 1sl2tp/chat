from pathlib import Path

PAGE = Path('c/index.html')


def test_public_guest_call_page_contract():
    text = PAGE.read_text() if PAGE.exists() else ''
    lower = text.lower()

    required = [
        'TAPHOA Call',
        'Tham gia cuộc gọi',
        'URLSearchParams',
        'guest-call-session.js',
        'v21-call-invite-guest',
        "action:'open'",
        'Liên kết đã hết hạn hoặc không còn hiệu lực',
        'Không thể kết nối cuộc gọi',
        'Đã vào phòng. Đang chờ bên kia…',
        'taphoa-guest-call-session-state',
        'mediaReady',
        'Đã kết nối. Bạn có thể nói chuyện.',
    ]
    for needle in required:
        assert needle in text, needle

    forbidden = [
        'auth.getUser',
        'signIn',
        'login',
        'window.location.replace',
        'window.location.href=',
        'getUserMedia(',
    ]
    for needle in forbidden:
        assert needle.lower() not in lower, needle

    open_pos = text.find("action:'open'")
    join_handler_pos = text.find('joinButton.addEventListener')
    join_call_pos = text.find('TaphoaGuestCallSession.joinGuest')
    assert open_pos >= 0
    assert join_handler_pos > open_pos
    assert join_call_pos > join_handler_pos

    waiting_pos = text.find('Đã vào phòng. Đang chờ bên kia…')
    healthy_pos = text.find('Đã kết nối. Bạn có thể nói chuyện.')
    media_listener_pos = text.find('taphoa-guest-call-session-state')
    assert waiting_pos > join_call_pos
    assert media_listener_pos >= 0
    assert healthy_pos >= 0


def test_public_page_does_not_expose_livekit_token_or_service_secret():
    text = PAGE.read_text() if PAGE.exists() else ''
    assert 'LIVEKIT_API_SECRET' not in text
    assert 'LIVEKIT_API_KEY' not in text
    assert 'participantToken=' not in text
