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


def test_public_page_does_not_expose_livekit_token_or_service_secret():
    text = PAGE.read_text() if PAGE.exists() else ''
    assert 'LIVEKIT_API_SECRET' not in text
    assert 'LIVEKIT_API_KEY' not in text
    assert 'participantToken=' not in text
