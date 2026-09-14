from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "zalo-admin-link.css").read_text("utf-8")


def compact(text: str) -> str:
    return "".join(text.split())


def test_desktop_directory_search_is_pulled_into_the_title_cluster():
    css = compact(CSS)
    owner = '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]'
    assert f'{owner}.wm-sidebar-header{{padding-bottom:8px!important}}' in css
    assert f'{owner}.wm-sidebar-body{{padding-top:0!important}}' in css


def test_desktop_chat_header_reads_as_chat_plus_selected_contact():
    css = compact(CSS)
    owner = '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#regionTop'
    assert f'{owner}[data-top-tab="chat"]::before{{content:"Tròchuyện"' in css
    assert f'{owner}.top-mode-switch{{background:transparent!important' in css


def test_desktop_work_column_starts_in_the_shared_top_header():
    css = compact(CSS)
    top = '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#regionTop'
    work = '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#workThreadView'
    assert f'{top}::after{{content:"Côngviệc"' in css
    assert f'{work}.work-thread-empty{{display:none!important}}' in css
