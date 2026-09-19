from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.source.html').read_text('utf-8')
orient=(ROOT/'chat-image-orientation.js').read_text('utf-8')
assert 'V21 image viewer redesign' in source
assert '.image-viewer-overlay{' in source
assert 'height:100dvh' in source
assert '.image-review-bottom{' in source
assert 'position:absolute' in source
assert '.image-review-filter-scroll{
    display:none;' in source
assert 'bottom:calc(.62rem + env(safe-area-inset-bottom,0px))' in orient
assert 'backdrop-filter:blur(16px)' in orient
print('professional image viewer layout contract PASS')
