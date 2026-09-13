from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'admin-order-source.js').read_text(encoding='utf-8')

assert 'order-source-image-viewer' in SRC, 'Tin đơn needs an inline image viewer inside its work area'
assert 'data-source-image-action="rotate-left"' in SRC, 'viewer needs rotate-left control'
assert 'data-source-image-action="rotate-right"' in SRC, 'viewer needs rotate-right control'
assert 'data-source-image-action="zoom-out"' in SRC, 'viewer needs zoom-out control'
assert 'data-source-image-action="zoom-in"' in SRC, 'viewer needs zoom-in control'
assert 'data-source-image-action="fit"' in SRC, 'viewer needs fit/reset control'
assert 'V21MediaCache' in SRC and 'ensureRemote' in SRC, 'viewer must reuse Chat media cache instead of opening a separate full-screen URL'
assert 'URL.createObjectURL' in SRC, 'viewer should render the cached customer image as a local object URL'
assert 'localStorage' in SRC and 'rotation' in SRC.lower(), 'per-image rotation should persist in Chat by asset id'
assert 'requestFullscreen' not in SRC, 'Tin đơn image viewer must not take over the whole screen'
assert '<dialog' not in SRC.lower(), 'Tin đơn image viewer must remain inline, not modal'
assert 'touch-action:none' in SRC.replace(' ', ''), 'zoomed image surface must support direct pan/zoom gestures without page takeover'

print('order-source inline image viewer contract PASS')
