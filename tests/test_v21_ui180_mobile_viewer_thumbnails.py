from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/"index.source.html").read_text("utf-8")
APP=(ROOT/"app.js").read_text("utf-8")
SW=(ROOT/"sw.js").read_text("utf-8")

def test_mobile_viewer_has_real_thumbnails_and_safe_area():
    assert "UI-180 — Narrow/mobile/PWA image viewer" in HTML
    css=HTML.split("UI-180 — Narrow/mobile/PWA image viewer",1)[1].split(".composer-icon-button{",1)[0]
    assert "@media (max-width:700px)" in css
    assert ".image-review-thumbs:not([hidden])" in css
    assert "display:flex!important;" in css
    assert "visibility:visible!important;" in css
    assert "overflow-x:auto!important;" in css
    assert "touch-action:pan-x;" in css
    assert "-webkit-overflow-scrolling:touch;" in css
    assert "env(safe-area-inset-bottom,0px)" in css
    assert "max-height:480px" in css
    assert "width:3rem!important;" in css
    assert "height:3rem!important;" in css
    assert "object-fit:cover!important;" in css
    assert "border-color:rgba(255,255,255,.92);" in css
    assert "transform:none;" in css

def test_existing_gallery_hydration_is_bounded_and_mobile_resizes_recover():
    assert "function renderImageViewerFilmstrip()" in APP
    assert "imageViewerFilmstrip.hidden=imageViewerItems.length<=1;" in APP
    assert "requestAnimationFrame(()=>hydrateVisibleViewerThumbs());" in APP
    assert "img.dataset.loading==='true'" in APP
    assert "thumb!==imageViewerFilmstrip?.children?.[index]" in APP
    assert "img.src=source.src;" in APP
    assert "thumbs.addEventListener('scroll',()=>{" in APP
    assert "const margin=72;" in APP
    assert "scrollIntoView" in APP
    # Feature-specific shell epochs must advance without breaking UI-180.
    import re
    assert re.search(r"const SHELL_CACHE_EPOCH='[a-z0-9-]+';",SW)
    assert "const CACHE_NAME='taphoa-chat-shell-'+RELEASE_VERSION+'-'+SHELL_CACHE_EPOCH;" in SW
