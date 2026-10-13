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

def test_patch_is_presentation_only():
    ownership=app[app.index('function singleImagePresentation('):app.index('function stableMessageDomKey(')]
    assert not any(tok in ownership for tok in ('fetch(','.rpc(','.send(', 'setInterval('))
    icon_owner=icons[icons.index('const CUSTOM='):icons.index('function customMarkup(')]
    assert not any(tok in icon_owner for tok in ('fetch(','.rpc(', 'setInterval('))
