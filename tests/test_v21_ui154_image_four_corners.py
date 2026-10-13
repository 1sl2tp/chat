from pathlib import Path

root=Path(__file__).resolve().parents[1]
css=(root/'index.source.html').read_text('utf-8')
sw=(root/'sw.js').read_text('utf-8')

def rule(selector):
    marker=selector+'{'
    assert marker in css, f'missing corner rule: {selector}'
    return css.split(marker,1)[1].split('}',1)[0]

single=rule('.media-image-tile[data-image-presentation]')
album=rule('.media-gallery-grid')
for label,style in [('single',single),('album',album)]:
    assert 'position:relative;' in style, label
    assert 'isolation:isolate;' in style, label
    assert 'padding:0;' in style, label
    assert 'border:0;' in style, label
    assert 'overflow:hidden;' in style, label
    assert 'border-radius:14px' in style, label
    assert 'border:1px' not in style, label

outline=rule('.media-image-tile[data-image-presentation]::after,\n.media-gallery-grid::after')
for token in (
    "content:'';",
    'position:absolute;',
    'inset:0;',
    'border:1px solid rgba(15,23,42,.09);',
    'border-radius:inherit;',
    'pointer-events:none;',
    'z-index:2;'
):
    assert token in outline, token

assert 'gap:4px!important;' in album
assert 'object-fit:contain!important;' in css
assert 'object-fit:cover!important;' in css
assert '.user-message-unit>.message-media-shell{margin-left:auto}' in css
assert '.assistant-message-unit>.message-media-shell{margin-right:auto}' in css
assert "const SHELL_CACHE_EPOCH='img154';" in sw
print('UI-154 four-corner clip / inset outline / no layout drift PASS')
