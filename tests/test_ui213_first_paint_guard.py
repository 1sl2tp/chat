"""UI-213: no old Chat frames may paint before session restoration.

The app has static header/composer/sidebar/auth markup in the HTML before
async authentication. Boot only shows a neutral status; guest and authenticated
surfaces still follow the existing owners.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.source.html").read_text("utf-8")
AUTH = (ROOT / "auth-session-store.js").read_text("utf-8")
SHELL = (ROOT / "shell.js").read_text("utf-8")
SW = (ROOT / "sw.js").read_text("utf-8")


def test_critical_guard_precedes_tailwind_and_document_body():
    guard_start = HTML.index('<style id="v21-first-paint-guard">')
    guard_end = HTML.index('</style>', guard_start)
    assert HTML.index("<title>TAPHOA Chat</title>") < guard_start
    assert guard_end < HTML.index('src="https://cdn.tailwindcss.com"')
    assert guard_end < HTML.index("<body>")
    guard = HTML[guard_start:guard_end]
    assert '#appShell[data-auth-state="booting"] > #screenHost' in guard
    assert '#appShell[data-auth-state="booting"] > #sessionHost' in guard
    assert 'visibility:hidden!important' in guard
    assert '#appShell[data-auth-state="booting"]::before' in guard
    assert 'Đang mở TAPHOA Chat' in guard
    assert '#appShell [hidden]' in guard
    assert '#globalOverlayRoot [hidden]' in guard
    assert '#appShell[data-auth-state="authenticated"] > #screenHost' not in guard
    assert '#appShell[data-auth-state="guest"] > #screenHost' not in guard


def test_boot_auth_transitions_remove_guard_without_fake_demo_or_legacy_frames():
    assert re.search(r'<div id="appShell"[^>]*data-auth-state="booting"', HTML)
    assert "appShell.dataset.authState=authenticated?'authenticated':'guest'" in SHELL
    assert 'setAuthenticated(false,null)' in AUTH
    assert 'setAuthenticated(true,account)' in AUTH
    assert "if(!initClient()){" in AUTH
    assert "authUI()?.setError?.('auth_unavailable')" in AUTH
    # Real Chat assets and account settings are not removed by first-paint fix.
    for id_ in ("chatScreen", "guestAuthThread", "sessionHost",
                "shellNavigationLayer", "globalOverlayRoot"):
        assert f'id="{id_}"' in HTML


def test_pwa_rotates_offline_shell_and_keeps_online_network_first():
    assert "pwa-first-paint-guard-20261024" in SW
    assert "event.respondWith(networkFirst(request,{navigation:true,event}));" in SW
    assert "const networkRequest=new Request(request,{cache:'no-store'});" in SW
