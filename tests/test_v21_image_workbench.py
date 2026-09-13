from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'app.js').read_text(encoding='utf-8')

# Regression gate: the image viewer is a workbench, not an exclusive mode.
# Image review must no longer take over the whole Chat screen. The composer and
# order-entry surface stay interactive while the image is open.
enter_start = APP.index('function enterImageViewerMode()')
enter_end = APP.index('function exitImageViewerMode()', enter_start)
enter_block = APP[enter_start:enter_end]
assert 'lockBaseUi:true' not in enter_block

open_start = APP.index('async function openImageViewer(')
open_end = APP.index('async function hydrateImageElement', open_start)
open_block = APP[open_start:open_end]
assert 'showModal' not in open_block
assert '.show()' in open_block

# Chat owns the viewing transform: rotate, zoom, fit/reset, and drag-to-pan.
for token in [
    'IMAGE_VIEWER_ROTATION_KEY',
    'rotateImageViewer(',
    'zoomImageViewer(',
    'fitImageViewer(',
    'applyImageViewerTransform(',
    'imageViewerPanX',
    'imageViewerPanY',
    'setPointerCapture',
    'image-workbench-toolbar',
    'Xoay trái',
    'Xoay phải',
    'Thu nhỏ',
    'Phóng to',
    'Vừa khung',
]:
    assert token in APP, f'missing image workbench behavior: {token}'

# Rotation belongs to each asset and survives reopening that same image.
assert "localStorage.setItem(IMAGE_VIEWER_ROTATION_KEY" in APP
assert "localStorage.getItem(IMAGE_VIEWER_ROTATION_KEY" in APP
assert 'activeImageViewerAssetId()' in APP

# Docked responsive workbench: desktop is a side panel; mobile is a short panel
# under the Chat header so the lower work/composer region remains visible.
assert '#imageViewerWorkbenchStyles' in APP
assert '@media (max-width: 759px)' in APP
assert 'height:min(44vh,420px)' in APP
assert 'width:min(540px' in APP

print('V21 docked image workbench contract PASS')
