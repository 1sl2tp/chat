from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')

segment=app[app.index("async function openImageViewer"):app.index("async function hydrateImageElement")]
assert "imageViewerOverlay.show();" in segment
assert "showModal" not in segment
assert "lockAppHeaderForImageViewer" not in app
assert "regionTop.setAttribute('inert','')" not in app
assert "lockBaseUi:false" in app
assert "#regionTop button,#shellNavigationLayer button,[data-contact-row],[data-contact-manage]" in app
assert "document.addEventListener('v21-active-contact-change'" in app
print("non-modal image viewer shell controls contract PASS")

assert "let imageViewerZoom=1;" in app
assert "const imageViewerPointers=new Map();" in app
assert "function setImageViewerZoom" in app
assert "function resetImageViewerZoom" in app
assert "beginImageViewerPinch" in app
assert "main.addEventListener('pointermove'" in app
assert "main.addEventListener('wheel'" in app
assert "image.addEventListener('dblclick'" in app
assert "imageViewerZoom===1" in app

assert "image-review-zoom-controls" in app
assert "image-review-zoom-value" in app
assert "stepImageViewerZoom" in app
assert "imageViewerZoom<2?2:Math.min(5,imageViewerZoom+.5)" in app
assert "if(imageViewerZoom>1)resetImageViewerZoom();" not in app

assert "window.matchMedia?.('(max-width:700px)')" in app
assert "title.textContent='Xem ảnh'" in app
