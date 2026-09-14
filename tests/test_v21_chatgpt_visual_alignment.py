from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "zalo-admin-link.css").read_text("utf-8")
SOURCE = (ROOT / "index.source.html").read_text("utf-8")


def compact(text: str) -> str:
    return "".join(text.split())


def test_chatgpt_reference_gutter_and_composer_density():
    css = compact(CSS)
    assert "--chat-content-gutter:16px!important" in css
    assert "--conversation-content-gutter:16px!important" in css
    assert "#attachmentTray:empty{display:none!important}" in css
    assert "#composerFooter{padding-bottom:6px!important}" in css


def test_chatgpt_reference_plus_button_geometry_stays_compact():
    css = compact(CSS)
    assert "#composer-plus-btn{width:36px!important;height:36px!important;min-width:36px!important;border-radius:999px!important}" in css
    assert "#composer-plus-btnsvg{width:20px;height:20px}" in css


def test_chatgpt_reference_top_surface_is_neutral_white():
    css = compact(CSS)
    assert ".header-surface-source{background:var(--theme-surface-primary)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}" in css
    assert "#regionTop.top-mode-switch{background:color-mix(insrgb,var(--theme-surface-secondary)45%,var(--theme-surface-primary))!important;}" in css
    assert "#regionTop.top-mode-tab[aria-selected=\"true\"]{box-shadow:01px3pxrgba(0,0,0,.06)!important;}" in css


def test_reference_structure_still_uses_one_shared_chat_content_axis():
    source = compact(SOURCE)
    assert 'class=\"h-full*:pointer-events-autocompact-top-gridchat-content-axis\"' in source
    assert 'class=\"composer-source-framechat-content-axis\"' in source
