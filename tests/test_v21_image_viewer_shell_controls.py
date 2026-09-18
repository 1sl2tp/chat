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
