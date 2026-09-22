from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "index.source.html").read_text(encoding="utf-8")
CSS = (ROOT / "mobile-ui-polish.css").read_text(encoding="utf-8")
APP = (ROOT / "app.js").read_text(encoding="utf-8")


def compact(value: str) -> str:
    return "".join(value.split())


def test_mobile_ui_polish_is_loaded_last():
    polish = SOURCE.index('href="./mobile-ui-polish.css"')
    head_close = SOURCE.index("</head>")
    legacy_style_close = SOURCE.rindex("</style>", 0, head_close)
    assert polish > SOURCE.index('href="./mobile-chat-refresh.css"')
    assert polish > legacy_style_close
    assert polish < head_close


def test_directory_polish_contract():
    c = compact(CSS)
    assert '.contact-directory-search{' in c
    assert 'height:44px!important;' in c
    assert '.contact-directory-filter[data-active="true"]{' in c
    assert '.shell-contact-row{' in c
    assert 'height:60px;' in c


def test_quick_menu_polish_contract():
    c = compact(CSS)
    assert '[data-mobile-account-menu].mobile-account-menu-panel{' in c
    assert 'width:196px!important;' in c
    assert '.mobile-account-menu-row{' in c
    assert 'min-height:43px!important;' in c


def test_account_settings_polish_contract():
    c = compact(CSS)
    assert '.zalo-account-card{' in c
    assert 'border-radius:24px!important;' in c
    assert '.zalo-account-searchinput{' in c
    assert '.zalo-account-row{' in c
    assert 'border-radius:0!important;' in c


def test_composer_menu_polish_contract():
    c = compact(CSS)
    assert '.composer-action-menu-source{' in c
    assert 'width:calc(100vw-24px)!important;' in c
    assert '.composer-action-menu-item{' in c
    assert 'min-height:48px!important;' in c
    assert '.composer-action-menu-icon{' in c
    assert 'width:38px!important;' in c


def test_keyboard_owner_stays_unchanged():
    assert "'ios-web':Object.freeze({keyboardVisualGapPx:6" in APP
    assert "'ios-pwa':Object.freeze({keyboardVisualGapPx:0" in APP
    assert "'android-web':Object.freeze({keyboardVisualGapPx:6" in APP
    assert "'android-pwa':Object.freeze({keyboardVisualGapPx:0" in APP
    c = compact(CSS)
    assert "position:fixed" not in c
    assert "safe-area-inset-bottom" not in c


def test_composer_menu_is_mobile_sheet():
    c = compact(CSS)
    assert '.composer-action-menu-surface::before{' in c
    assert 'width:34px;' in c
    assert 'height:4px;' in c
    assert 'left:12px!important;' in c
    assert 'right:12px!important;' in c
    assert 'border-radius:24px!important;' in c
