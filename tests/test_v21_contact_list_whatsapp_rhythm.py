from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHELL = (ROOT / "shell.js").read_text("utf-8")
SOURCE = (ROOT / "index.source.html").read_text("utf-8")


def compact(text: str) -> str:
    return "".join(text.split())


def test_contact_time_uses_clock_then_weekday_then_compact_date():
    shell = compact(SHELL)
    assert "constdayDiff=Math.floor((startOfToday-startOfDate)/86400000);" in shell
    assert "if(dayDiff>=1&&dayDiff<=6)returndate.toLocaleDateString('vi-VN',{weekday:'long'});" in shell
    assert "returndate.toLocaleDateString('vi-VN',{day:'numeric',month:'numeric',year:'2-digit'});" in shell


def test_contact_manage_action_only_appears_on_hover_or_keyboard_focus_desktop():
    source = compact(SOURCE)
    assert "@media(hover:hover)and(pointer:fine){.shell-contact-manage{opacity:0;pointer-events:none" in source
    assert ".shell-contact-row:hover.shell-contact-manage,.shell-contact-row:focus-within.shell-contact-manage{opacity:1;pointer-events:auto" in source


def test_contact_rows_follow_chatgpt_compact_surface_rhythm():
    source = compact(SOURCE)
    assert ".shell-contact-row{position:relative;width:100%;height:60px;min-height:60px" in source
    assert "grid-template-columns:40pxminmax(0,1fr)52px" in source
    assert "column-gap:12px" in source
    assert ".shell-contact-row:not(:last-child)::after{display:none}" in source
    assert "background:var(--theme-action-ghost-surface-hover)" in source
