from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "zalo-admin-link.css").read_text("utf-8")


def compact(text: str) -> str:
    return "".join(text.split())


def test_desktop_directory_search_is_pulled_into_the_title_cluster():
    css = compact(CSS)
    assert ".wm-sidebar-header{padding-bottom:8px!important}" in css
    assert ".wm-sidebar-body{padding-top:0!important}" in css


def test_desktop_chat_header_reads_as_chat_plus_selected_contact():
    css = compact(CSS)
    assert "[data-top-tab=\"chat\"]::before{content:\"Tròchuyện\"" in css
    assert ".top-mode-switch{background:transparent!important" in css


def test_desktop_work_column_starts_at_the_top_and_empty_state_is_not_centered():
    css = compact(CSS)
    assert ".work-thread-frame::before{content:\"Côngviệc\"" in css
    assert ".work-thread-empty{display:none!important}" in css
