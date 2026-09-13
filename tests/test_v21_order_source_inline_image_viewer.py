from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIEWER = (ROOT / 'order-source-image-viewer.js').read_text(encoding='utf-8')
CORE = (ROOT / 'order-source-core.mjs').read_text(encoding='utf-8')
SRC = VIEWER + '\n' + CORE

assert "import './order-source-image-viewer.js'" in CORE, 'Tin đơn core must load the inline viewer with the source panel'
assert '__V21LastOrderSourceGroup' in CORE, 'viewer needs the current source image assets without coupling to order lifecycle state'
assert 'order-source-image-viewer' in VIEWER, 'Tin đơn needs an inline image viewer inside its work area'
assert 'data-source-image-action="rotate-left"' in VIEWER, 'viewer needs rotate-left control'
assert 'data-source-image-action="rotate-right"' in VIEWER, 'viewer needs rotate-right control'
assert 'data-source-image-action="zoom-out"' in VIEWER, 'viewer needs zoom-out control'
assert 'data-source-image-action="zoom-in"' in VIEWER, 'viewer needs zoom-in control'
assert 'data-source-image-action="fit"' in VIEWER, 'viewer needs fit/reset control'
assert 'V21MediaCache' in VIEWER and 'ensureRemote' in VIEWER, 'viewer must reuse Chat media cache instead of opening a separate full-screen URL'
assert 'URL.createObjectURL' in VIEWER, 'viewer should render the cached customer image as a local object URL'
assert 'localStorage' in VIEWER and 'rotation' in VIEWER.lower(), 'per-image rotation should persist in Chat by asset id'
assert 'requestFullscreen' not in SRC, 'Tin đơn image viewer must not take over the whole screen'
assert '<dialog' not in SRC.lower(), 'Tin đơn image viewer must remain inline, not modal'
assert 'touch-action:none' in VIEWER.replace(' ', ''), 'zoomed image surface must support direct pan/zoom gestures without page takeover'

print('order-source inline image viewer contract PASS')
