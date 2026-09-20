from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'work-customer-summary.css').read_text('utf-8')

# Header is a fixed sibling above the scroll body, not a sticky child.
header=css[css.index('.work-summary-header{'):css.index('.work-summary-detail-header{')]
assert 'position:relative;' in header
assert 'position:sticky' not in header
assert 'top:0' not in header
assert 'z-index:' not in header

# Body is the scroll owner and reserves scrollbar space.
body=css[css.index('.work-summary-body{'):css.index('.work-summary-overview{')]
assert 'overflow:auto;' in body
assert 'overscroll-behavior:contain;' in body
assert 'scrollbar-gutter:stable;' in body

# Back/All is one pill-shaped contextual action with subtle hover/focus.
all_button=css[css.index('.work-summary-all{'):css.index('.work-summary-body{')]
assert 'border-radius:999px;' in all_button
assert '.work-summary-all:hover{' in css
assert '.work-summary-all:focus-visible{' in css

print('V21.72.54 Region 3 header/scroll owner PASS')
