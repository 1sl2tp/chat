from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHELL = (ROOT / "shell.js").read_text(encoding="utf-8")
SOURCE = (ROOT / "index.source.html").read_text(encoding="utf-8")
CSS = (ROOT / "mobile-chat-refresh.css").read_text(encoding="utf-8")
APP = (ROOT / "app.js").read_text(encoding="utf-8")


def compact(value: str) -> str:
    return "".join(value.split())


def test_mobile_refresh_is_loaded_from_canonical_source():
    assert 'href="./mobile-chat-refresh.css"' in SOURCE
    assert 'data-build-source="mobile-chat-refresh.css"' in SOURCE


def test_idle_call_action_only_exists_inside_selected_chat():
    assert "const showIdleCall=route==='chat'&&hasContact;" in SHELL
    assert "const showCallSurface=presentation.state!=='idle'||showIdleCall;" in SHELL
    assert "slot.hidden=!showCallSurface;" in SHELL
    # Live/incoming call presentation stays globally controllable.
    assert "presentation.state!=='idle'" in SHELL


def test_mobile_chat_work_swipe_is_shell_owned_and_does_not_prevent_scroll():
    assert "function beginMobileRouteSwipe(event)" in SHELL
    assert "function finishMobileRouteSwipe(event)" in SHELL
    assert "horizontal<64" in SHELL
    assert "horizontal<Math.abs(dy)*1.35" in SHELL
    assert "if(route==='chat'&&dx<0)return NavigationCommand.openWork();" in SHELL
    assert "if(route==='work'&&dx>0)return NavigationCommand.openChat();" in SHELL
    assert "screenHost.addEventListener('pointerdown',beginMobileRouteSwipe,{passive:true});" in SHELL
    assert "screenHost.addEventListener('pointerup',finishMobileRouteSwipe,{passive:true});" in SHELL
    assert "preventDefault()" not in SHELL[SHELL.index("function beginMobileRouteSwipe"):SHELL.index("const NavigationCommand")]


def test_swipe_is_disabled_while_keyboard_or_overlay_owns_interaction():
    assert "stageLayout?.dataset.keyboardOpen==='true'" in SHELL
    assert "globalOverlayRoot?.childElementCount" in SHELL
    assert "sidebarOpen||callState!=='IDLE'" in SHELL
    assert "'textarea','input','select','button','a','[role="button"]'" in SHELL


def test_mobile_composer_keeps_up_arrow_and_uses_adaptive_grid():
    assert 'id="send"' in SOURCE
    assert 'data-arrow="up"' in SOURCE
    assert 'M10 16V4' in SOURCE
    c = compact(CSS)
    assert '#composerShell{grid-template-columns:40pxminmax(0,1fr)40px40px;' in c
    assert '#editorWrap{grid-column:2;grid-row:3;' in c
    assert '#composer-plus-btn{grid-column:1;grid-row:3;' in c
    assert '#composer-mic-btn{grid-column:3;grid-row:3;' in c
    assert '#send{grid-column:4;grid-row:3;' in c


def test_keyboard_placement_owner_is_not_reimplemented_in_feature_css():
    # VisualViewport/fixed composer placement must remain with existing platform owners.
    assert "position:fixed" not in compact(CSS)
    assert '#stageLayout[data-keyboard-open="true"].composer-source-frame' in compact(CSS)


def test_mobile_message_surfaces_keep_sender_hierarchy():
    c = compact(CSS)
    assert '.assistant-message-unit>.message-text{' in c
    assert '.user-message-unit>.message-text{' in c
    assert 'background:color-mix(insrgb,var(--theme-surface-secondary)94%,var(--theme-surface-primary))!important;' in c


def test_keyboard_gap_has_one_owner():
    assert "'ios-web':Object.freeze({keyboardVisualGapPx:6" in APP
    assert "'ios-pwa':Object.freeze({keyboardVisualGapPx:0" in APP
    assert "'android-web':Object.freeze({keyboardVisualGapPx:6" in APP
    assert "'android-pwa':Object.freeze({keyboardVisualGapPx:0" in APP
    c = compact(CSS)
    assert '#stageLayout[data-keyboard-open="true"].composer-source-frame{margin-bottom:' not in c


def test_keyboard_scroll_control_does_not_create_composer_gap():
    c = compact(CSS)
    assert '#stageLayout[data-keyboard-open="true"]#threadScrollControlWrap{height:0!important;margin-bottom:0!important;}' in c
    assert '#stageLayout[data-keyboard-open="true"][data-scroll-from-end]#threadScrollControlMotion{top:-46px;bottom:auto;}' in c


def test_keyboard_open_removes_closed_safe_area_margin():
    c = compact(CSS)
    assert '#appShell[data-auth-state="authenticated"][data-route="chat"]#stageLayout[data-keyboard-open="true"][data-composer-placement="visual-viewport"].composer-source-frame{margin-bottom:0!important;padding-bottom:0!important;}' in c
    assert 'margin-bottom:calc(8px+env(safe-area-inset-bottom,0px));' in c
