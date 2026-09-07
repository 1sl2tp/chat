from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

source=read('index.source.html')
app=read('app.js')

assert 'V21.72.31' in source
assert 'function singleImagePresentation(media)' in app
assert "kind:'portrait'" in app
assert "kind:'square'" in app
assert "kind:'landscape'" in app
assert 'width:256' in app
assert 'width:320' in app
assert 'width:400' in app
assert 'aspectRatio:Math.max(.5,Math.min(.82,sourceRatio))' in app
assert 'aspectRatio:Math.max(1.2,Math.min(2.2,sourceRatio))' in app
assert 'function applySingleImagePresentation(wrap,media)' in app
assert "wrap.dataset.imagePresentation=presentation.kind" in app
assert "img.style.objectFit='contain'" in app
assert 'ratio*420' not in app
assert 'Math.max(150,Math.min(360' not in app

assert "width:400px;max-width:100%;gap:4px" in app
assert "width:360px;max-width:100%;gap:4px" not in app
assert "className:'block h-full w-full object-cover'" in app

assert '.media-image-tile[data-image-presentation]' in source
assert 'object-fit:contain!important' in source
assert '.media-gallery-grid{' in source
assert 'width:min(25rem,100%)!important' in source
assert '.media-gallery-grid .media-image-tile > img' in source
assert 'object-fit:cover!important' in source

print('V21.72.31 image presentation owner contract PASS')
