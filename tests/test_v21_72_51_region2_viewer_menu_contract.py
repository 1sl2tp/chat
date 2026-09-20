from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/"app.js").read_text("utf-8")

def compact(value):
    return "".join(value.split())

c=compact(app)

# Viewer time menu follows one open/close contract.
assert "functiontoggleImageViewerTimeMenu(force,{restoreFocus=false}={})" in c
assert "imageViewerTimeMenuPanel.hidden=!open;" in c
assert "imageViewerTimeMenuButton.setAttribute('aria-expanded',open?'true':'false')" in c

# Trigger declares the owned menu and opening moves focus into it.
assert "more.setAttribute('aria-controls','imageReviewTimeMenu');" in app
assert "menu.id='imageReviewTimeMenu';" in app
assert "imageViewerTimeMenuPanel?.querySelector?.('.image-review-menu-item')?.focus?.({preventScroll:true})" in app

# Escape closes the menu first; a second Escape closes the viewer.
assert "if(imageViewerTimeMenuPanel?.hidden===false){" in app
assert "toggleImageViewerTimeMenu(false,{restoreFocus:true});" in app
assert "}else{\n        closeImageViewer();\n      }" in app

# Click outside only dismisses the menu; it does not close the viewer.
outside=app[app.index("overlay.addEventListener('click',event=>{"):][:500]
assert "toggleImageViewerTimeMenu(false);" in outside
assert "closeImageViewer();" not in outside

print("V21.72.51 Region 2 viewer menu contract PASS")
