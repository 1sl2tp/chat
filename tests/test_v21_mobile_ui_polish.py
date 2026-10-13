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
    assert 'width:218px!important;' in c
    assert '.mobile-account-menu-row{' in c
    assert 'min-height:44px!important;' in c


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

def test_ui_145_one_layout_rail_for_header_directory_and_composer():
    foundation=(ROOT/'ui-foundation.css').read_text('utf-8')
    chat=(ROOT/'mobile-chat-refresh.css').read_text('utf-8')
    core=(ROOT/'index.source.html').read_text('utf-8')
    polish=CSS
    assert '--ui-chat-layout-rail:12px;' in foundation
    assert '--ui-chat-message-rail:6px;' in foundation
    # Top header is already a .chat-content-axis; mobile !important must win
    # over legacy desktop 16px !important, with no double horizontal padding.
    assert 'padding-inline:var(--chat-content-gutter)!important;' in core
    assert 'padding-left:max(var(--ui-chat-layout-rail,12px),env(safe-area-inset-left,0px))!important;' in polish
    assert 'padding-right:max(var(--ui-chat-layout-rail,12px),env(safe-area-inset-right,0px))!important;' in polish
    assert 'grid-template-columns:40px minmax(0,1fr) auto;' in polish
    assert '--ui-composer-effective-gutter:max(var(--ui-chat-layout-rail,12px),' in chat
    assert 'padding-inline:0!important;' in chat
    # Directory shell: header starts at 12; search/filter = body6+tools6;
    # avatar/right timestamp = body6+list2+contact-row4.
    assert 'padding-left:max(6px,calc(env(safe-area-inset-left,0px) - 6px));' in polish
    assert 'padding-right:max(6px,calc(env(safe-area-inset-right,0px) - 6px));' in polish
    assert 'padding:4px 6px 7px!important;' in polish
    assert 'padding:0 2px 8px;' in polish
    assert 'padding:8px 4px;' in polish
    assert 'scrollbar-gutter:auto;' in polish
    # Text/media message edges intentionally use a separate 6px rail.
    assert 'max(var(--ui-chat-message-rail,6px),env(safe-area-inset-left,0px))' in chat
    assert 'max(var(--ui-chat-message-rail,6px),env(safe-area-inset-right,0px))!important;' in chat
    # Don't replace source action/state or keyboard scroller ownership.
    assert 'position:fixed' not in compact(polish)
    assert '#scrollRoot{' in chat

def test_ui_146_root_sidebar_padding_and_pwa_shell_invalidation():
    # Reference CSS ships 24px around the whole sidebar; without this reset,
    # UI-145's correctly calculated 12px child rail appeared 36px from edge.
    reference=(ROOT/'reference/chatgpt/full-source/raw-css/app-CIyuNPp8.css').read_text('utf-8')
    assert 'var(--size-24,1.5rem)' in reference
    assert '#appShell[data-auth-state="authenticated"][data-mobile-directory="true"] #shellNavigationLayer .wm-sidebar-sidebar{' in CSS
    assert 'padding-inline:0!important;' in CSS
    # Geometry remains owned by existing title/tools/list selectors, not a
    # transform/position trick or new scroll owner.
    assert 'padding:4px 6px 7px!important;' in CSS
    assert 'padding:8px 4px;' in CSS
    worker=(ROOT/'sw.js').read_text('utf-8')
    assert "const SHELL_CACHE_EPOCH='ui150';" in worker
    assert "const CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION+'-'+SHELL_CACHE_EPOCH;" in worker
    assert "const AVATAR_CACHE_NAME='taphoa-chat-avatars-v1';" in worker
    assert 'navigationCachedThenNetwork(request,event)' in worker
    assert "await self.skipWaiting();" in worker
    assert "await self.clients.claim();" in worker
    assert "key.startsWith('taphoa-chat-shell-')&&key!==CACHE_NAME" in worker

def test_ui_147_mobile_directory_vertical_spacing_only():
    # Source tokens and active overlay CSS own the two spaces, never list rows.
    foundation=(ROOT/'ui-foundation.css').read_text('utf-8')
    assert '--ui-directory-root-top-min:12px;' in foundation
    assert '--ui-directory-top-trim:16px;' in foundation
    selector='#appShell[data-auth-state="authenticated"][data-mobile-directory="true"] #shellNavigationLayer '
    root=CSS.split(selector+'.wm-sidebar-sidebar{',1)[1].split('}',1)[0]
    header=CSS.split(selector+'.wm-sidebar-header{',1)[1].split('}',1)[0]
    body=CSS.split(selector+'.wm-sidebar-body{',1)[1].split('}',1)[0]
    assert 'padding-inline:0!important;' in root  # UI-146 12px rail stays
    assert 'padding-block-start:max(var(--ui-directory-root-top-min,12px),calc(env(safe-area-inset-top,0px) - var(--ui-directory-top-trim,16px)))!important;' in root
    assert 'padding-bottom:0;' in header
    assert 'padding-block-start:0!important;' in body
    assert '.contact-directory-search{\n    height:var(--ui-control-touch,44px)!important;' in CSS
    assert '.shell-contact-row{\n    height:60px;' in CSS
    assert 'padding:8px 4px;' in CSS
    # No positional hacks and no change to scroll-owner or runtime behavior.
    vertical=''.join((root,header,body))
    for bad in ('transform:', 'translate:', 'margin-top:', 'position:', 'scrollTop', 'overflow-y:', 'fetch(', '.rpc('):
        assert bad not in vertical
