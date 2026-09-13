from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'chat-image-orientation.js'
INDEX = (ROOT / 'index.source.html').read_text(encoding='utf-8')

assert MODULE.exists(), 'Chat needs a dedicated image orientation/viewer scope module'
SRC = MODULE.read_text(encoding='utf-8')

assert 'chat-image-orientation.js' in INDEX, 'orientation module must load with normal Chat, not only Tin đơn'
assert '.media-image-tile' in SRC, 'rotation must apply to images in the conversation itself'
assert 'data-chat-image-rotate' in SRC, 'conversation image needs a local rotate control'
assert 'localStorage' in SRC and 'assetId' in SRC, 'rotation must persist per media asset'
assert '.image-viewer-overlay' in SRC, 'rotation controls must still attach to the shared Chat image viewer'
assert '--chat-image-viewer-left' not in SRC and '--chat-image-viewer-right' not in SRC, 'rotation module must not own viewer geometry'
assert 'updateViewerBounds' not in SRC, 'app.js is the sole image/album viewer geometry owner'
assert 'data-chat-viewer-rotate-left' in SRC and 'data-chat-viewer-rotate-right' in SRC, 'large viewer needs rotate controls too'
assert 'requestFullscreen' not in SRC, 'large image must stay inside Chat column and never use fullscreen'
assert 'activeScreenSlot' not in SRC, 'new scope must not use the desktop screen host that includes the work column'

print('chat image orientation + column-2 viewer contract PASS')
