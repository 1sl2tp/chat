from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
source=(ROOT/'index.source.html').read_text('utf-8')
foundation=(ROOT/'ui-foundation.css').read_text('utf-8')
polish=(ROOT/'mobile-ui-polish.css').read_text('utf-8')
menu=(ROOT/'work-customer-summary.js').read_text('utf-8')
icons=(ROOT/'ui-icons.js').read_text('utf-8')
library=(ROOT/'ui-library/index.html').read_text('utf-8')

def test_composer_ui_library_equal_accessible_buttons_and_glyphs():
    for button in ('#composer-plus-btn','#composer-mic-btn','#send'):
        assert button in foundation
    assert 'width:var(--ui-control-touch);' in foundation
    assert 'min-width:var(--ui-control-touch);' in foundation
    assert 'height:var(--ui-control-touch);' in foundation
    assert 'width:var(--ui-icon-20);' in foundation
    assert 'height:var(--ui-icon-20);' in foundation
    assert '--ui-control-touch:44px;' in foundation
    assert '--ui-icon-20:20px;' in foundation
    assert 'grid-template-columns:44px minmax(0,1fr) 44px 44px' in library
    assert 'type="submit" data-action="send"' in source

def test_portrait_is_fitted_but_image_source_and_gallery_unchanged():
    body=app[app.index('function singleImagePresentation('):app.index('function singleImageDisplayWidth(')]
    assert 'const inlineHeight=460;' in body
    assert 'Math.min(MESSAGE_MEDIA_WIDTH_PX,Math.max(160,Math.round(inlineHeight*aspectRatio)))' in body
    assert body.count('width:MESSAGE_MEDIA_WIDTH_PX')==2
    assert "wrap.style.setProperty('--message-media-width'" in app
    assert "shell.style.setProperty('--message-media-width'" in app
    assert 'max-height:min(48dvh,460px);' in source
    assert 'width:min(22.5rem,var(--message-media-width,22.5rem))!important;' in source
    assert 'object-fit:contain!important' in source
    assert 'object-fit:cover!important' in source  # Albums retain same behavior.
    assert 'const MESSAGE_MEDIA_WIDTH_PX=360;' in app
    assert 'openImageViewer' in app

def test_single_image_first_mount_and_existing_history_share_one_width_owner():
    # Newly rendered remote/self photos used to get a 360px shell even when
    # the portrait tile had already been measured at a smaller width.
    # Old cached DOM / reconciled messages must use exactly the same rule.
    create=app[app.index('function createMessageMediaShell('):app.index('function patchMessageMediaShell(')]
    patch=app[app.index('function patchMessageMediaShell('):app.index('function patchMessageNode(')]
    assert 'return patchMessageMediaShell(shell,media);' in create
    assert "shell.style.setProperty('--message-media-width',`${width}px`)" in patch
    assert "tile?.dataset.intrinsicAspectRatio" in patch
    assert "const naturalRatio=img.naturalWidth/img.naturalHeight;" in app
    assert 'applySingleImagePresentation(wrap,{aspectRatio:naturalRatio});' in app
    assert "shell.style.removeProperty('--message-media-width');" in patch
    assert 'createMessageMediaShell(mediaNode,message.media)' in app
    assert 'patchMessageMediaShell(mediaShell,message.media);' in app

    # Both canonical shells and still-mounted legacy direct image nodes must
    # size by image ratio, not force a 360px envelope with centered letterboxing.
    image_rule=source[source.index('#messageWindow .message-unit>.media-image-tile[data-image-presentation]'):]
    assert 'width:min(22.5rem,var(--message-media-width,22.5rem))!important;' in image_rule.split('}',1)[0]
    assert '#messageWindow .message-unit>.media-gallery-grid{\n  width:22.5rem!important;' in image_rule


def test_account_menu_uses_existing_icon_registry_and_44px_rows():
    assert 'width:218px!important;' in polish
    assert 'min-height:44px!important;' in polish
    assert 'grid-template-columns:20px minmax(0,1fr);' in polish
    for action,icon in [('directory','contacts'),('account','account'),('settings','settings'),('logout','logout')]:
        assert f'data-mobile-account-action="{action}"' in menu
        assert f"window.V21Icons?.markup('{icon}',{{size:20}})" in menu
        assert f'{icon}:Object.freeze' in icons
    assert '[data-mobile-account-action="logout"]' in polish
    assert "['Danh bạ','contacts']" in library
    assert "['Thoát','logout']" in library
    assert "if(action==='directory')" in menu
    assert "if(action==='logout')" in menu

def test_mobile_composer_uses_one_geometry_contract_across_states():
    mobile=(ROOT/'mobile-chat-refresh.css').read_text('utf-8')
    # Outer screen gutter is paid once, not once by width AND again by
    # the inherited .chat-content-axis padding-inline:16px!important.
    frame=mobile[mobile.index('/* ChatGPT-like adaptive dock:'):mobile.index('#composerShell{')]
    assert '--ui-composer-effective-gutter:max(' in frame
    assert 'width:min(calc(100% - var(--ui-composer-effective-gutter) - var(--ui-composer-effective-gutter)),44rem);' in frame
    assert 'padding-inline:0!important;' in frame
    assert '--ui-composer-gutter:12px;' in foundation
    assert '--ui-composer-inner-inset:4px;' in foundation
    assert '--ui-composer-action-gap:4px;' in foundation
    assert '--ui-composer-send-disc:36px;' in foundation
    assert '--ui-composer-mic-glyph:20px;' in foundation
    assert '--ui-composer-arrow-glyph:18px;' in foundation
    assert '--ui-composer-stroke:1.6px;' in foundation

    # All three targets remain 44 CSS px despite the legacy 36px !important
    # button source and regardless of mic/send state.
    assert ':is(#composer-plus-btn,#composer-mic-btn,#send){' in mobile
    assert 'width:var(--ui-control-touch,44px)!important;' in mobile
    assert 'min-width:var(--ui-control-touch,44px)!important;' in mobile
    assert 'height:var(--ui-control-touch,44px)!important;' in mobile
    assert 'min-height:var(--ui-control-touch,44px)!important;' in mobile
    assert 'gap:0 var(--ui-composer-action-gap,4px);' in mobile
    assert 'padding:2px var(--ui-composer-inner-inset,4px);' in mobile

    # The painted Send disk is 36px inside a 44px hit area. Only background
    # color changes when data-can-send toggles; no state-specific dimensions.
    assert 'border:calc((var(--ui-control-touch,44px) - var(--ui-composer-send-disc,36px)) / 2) solid var(--cgpt-composer-surface-primary);' in mobile
    assert '#composerShell:not([data-can-send="true"]) #send{' in mobile
    assert 'background:var(--theme-submit-btn-bg);' in source
    assert 'data-arrow="up"' in source
    assert '#composer-mic-btn svg{' in mobile
    assert '#send svg{' in mobile
    assert 'width:var(--ui-composer-mic-glyph,20px)!important;' in mobile
    assert 'width:var(--ui-composer-arrow-glyph,18px)!important;' in mobile
    assert 'data-icon="' in library and "esc(name)" in library
    assert '.demo-composer .icon-btn[data-icon="send"]{border:4px solid #fff}' in library
    assert '.demo-composer{display:grid;grid-template-columns:44px minmax(0,1fr) 44px 44px;align-items:center;gap:0 4px;' in library

def test_patch_is_presentation_only():
    ownership=app[app.index('function singleImagePresentation('):app.index('function stableMessageDomKey(')]
    assert not any(tok in ownership for tok in ('fetch(','.rpc(','.send(', 'setInterval('))
    icon_owner=icons[icons.index('const CUSTOM='):icons.index('function customMarkup(')]
    assert not any(tok in icon_owner for tok in ('fetch(','.rpc(', 'setInterval('))
