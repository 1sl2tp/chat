from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "zalo-admin-link.css").read_text("utf-8")
SOURCE = (ROOT / "index.source.html").read_text("utf-8")


def compact(text: str) -> str:
    return "".join(text.split())


def test_desktop_directory_search_is_pulled_into_the_title_cluster():
    css = compact(CSS)
    owner = '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]'
    assert f'{owner}.wm-sidebar-header{{padding-bottom:8px!important}}' in css
    assert f'{owner}.wm-sidebar-body{{padding-top:0!important}}' in css


def test_desktop_chat_header_uses_selected_contact_without_duplicate_mode_label():
    css = compact(CSS)
    owner = '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#regionTop'
    assert f'{owner}[data-top-tab="chat"]::before{{content:none!important' in css
    assert f'{owner}[data-top-tab="work"]{{display:none!important;}}' in css
    assert f'{owner}.top-mode-switch{{width:auto!important' in css
    assert f'{owner}.top-mode-contact-avatar{{display:none!important;}}' in css


def test_desktop_work_column_starts_in_the_shared_top_header():
    css = compact(CSS)
    top = '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#regionTop'
    work = '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#workThreadView'
    assert f'{top}::after{{content:"Côngviệc"' in css
    assert f'{work}.work-thread-empty{{display:none!important}}' in css


def test_layout_owners_distinguish_mobile_desktop_and_wide_desktop():
    source = SOURCE
    compact_source = compact(SOURCE)
    assert "V21 geometry owner map: mobile is one active screen + overlay directory" in source
    assert '@media(min-width:64rem)and(hover:hover)and(pointer:fine)' in compact_source
    assert 'grid-template-columns:var(--desktop-directory-width)minmax(0,1fr)' in compact_source
    assert '@media(min-width:80rem)and(hover:hover)and(pointer:fine)' in compact_source
    assert '--desktop-work-width:clamp(360px,30vw,400px)' in compact_source
    assert '--desktop-chat-width:calc(100%-var(--desktop-work-width))' in compact_source
    assert '#shellNavigationLayer{position:fixed;inset:0' in compact_source
    assert '.wm-sidebar-sidebar{box-sizing:border-box;display:grid;grid-template-areas:"header""navigation""footer";grid-template-rows:autominmax(0,1fr)auto' in compact_source
