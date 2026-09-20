from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
source=(ROOT/'index.source.html').read_text('utf-8')

# One media-width owner: single images and galleries share the same 360px target.
assert 'const MESSAGE_MEDIA_WIDTH_PX=360;' in app
single=app[app.index('function singleImagePresentation'):app.index('function singleImageDisplayWidth')]
assert single.count('width:MESSAGE_MEDIA_WIDTH_PX')==3
gallery=app[app.index('function applyImageGalleryGeometry'):app.index('function patchImageGalleryNode')]
assert 'width:${MESSAGE_MEDIA_WIDTH_PX}px;max-width:100%;gap:4px' in gallery

# Loaded media no longer wipes the CSS-owned surface back to transparent.
assert "wrap.style.background='transparent';" not in app
assert app.count("wrap.style.background='';")>=3

single_css_start=source.index('.media-image-tile[data-image-presentation]{')
single_css_end=source.index('}',single_css_start)
single_css=source[single_css_start:single_css_end+1]
for token in [
    'width:22.5rem!important;',
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
