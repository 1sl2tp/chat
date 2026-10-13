from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
source=(ROOT/'index.source.html').read_text('utf-8')

# F-133 rev2: gallery 360, portrait 260 by 560, square 320, landscape 360.
assert 'const MESSAGE_MEDIA_WIDTH_PX=360;' in app
assert 'const MESSAGE_PORTRAIT_WIDTH_PX=260;' in app
assert 'const MESSAGE_PORTRAIT_MAX_HEIGHT_PX=560;' in app
assert 'const MESSAGE_SQUARE_WIDTH_PX=320;' in app
single=app[app.index('function singleImagePresentation'):app.index('function singleImageDisplayWidth')]
assert single.count('width:MESSAGE_MEDIA_WIDTH_PX')==1
assert 'Math.floor(MESSAGE_PORTRAIT_MAX_HEIGHT_PX*sourceRatio)' in single
assert 'width:MESSAGE_SQUARE_WIDTH_PX' in single
assert 'messageInlineImageHeightLimit' not in app
assert 'scheduleImagePresentationResize' not in app
assert "shell.style.setProperty('--message-media-width'" in app
gallery=app[app.index('function applyImageGalleryGeometry'):app.index('function patchImageGalleryNode')]
assert 'width:${MESSAGE_MEDIA_WIDTH_PX}px;max-width:100%;gap:4px' in gallery

# Loaded media no longer wipes the CSS-owned surface back to transparent.
assert "wrap.style.background='transparent';" not in app
assert app.count("wrap.style.background='';")>=3

single_css_start=source.index('.media-image-tile[data-image-presentation]{')
single_css_end=source.index('}',single_css_start)
single_css=source[single_css_start:single_css_end+1]
for token in [
    'width:min(22.5rem,var(--message-media-width,22.5rem))!important;',
    'max-width:100%;',
    'box-sizing:border-box;',
    'padding:4px;',
    'border-radius:14px;',
    'background:var(--theme-surface-secondary);'
]:
    assert token in single_css

gallery_css_start=source.index('.media-gallery-grid{')
gallery_css_end=source.index('}',gallery_css_start)
gallery_css=source[gallery_css_start:gallery_css_end+1]
for token in [
    'width:22.5rem!important;',
    'max-width:100%;',
    'box-sizing:border-box;',
    'padding:4px;',
    'gap:4px!important;',
    'background:var(--theme-surface-secondary);'
]:
    assert token in gallery_css

# Preserve media content policy: single images contain, gallery tiles cover.
assert '.media-image-tile[data-image-presentation] > img' in source
assert 'object-fit:contain!important' in source
assert '.media-gallery-grid .media-image-tile > img' in source
assert 'object-fit:cover!important' in source

print('V21.72.75 message media surface/width owner PASS')

assert 'max-height:560px;' in source
assert 'max-height:min(48dvh,460px);' not in source
assert '.message-media-shell[data-media-shell-kind="image"]{' in source
assert 'width:min(22.5rem,var(--message-media-width,22.5rem));' in source
