from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'app.js').read_text(encoding='utf-8')
ORIENTATION = (ROOT / 'chat-image-orientation.js').read_text(encoding='utf-8')

# Album hiện tại uses the same overlay as single-image viewing; both must stop
# at the work-column boundary on the 3-column desktop workspace.
start = APP.index('function positionImageViewerBelowHeader()')
end = APP.index('function syncOpenImageViewerRegion()', start)
POSITION = APP[start:end]

assert "workThreadView" in POSITION, (
    'desktop image/album viewer must stop at the left edge of workThreadView, '
    'not at stageLayout.right'
)
assert '.left' in POSITION and 'viewportWidth' in POSITION, (
    'viewer right inset must be derived from the visible work-column left boundary'
)

assert '--chat-image-viewer-left' not in ORIENTATION, (
    'image rotation module must not override the viewer geometry owned by app.js'
)
assert '--chat-image-viewer-right' not in ORIENTATION, (
    'image rotation module must not override the viewer geometry owned by app.js'
)
assert 'updateViewerBounds' not in ORIENTATION, (
    'rotation helper must not independently recompute album/viewer bounds'
)

print('chat album viewer column-2 geometry contract PASS')
