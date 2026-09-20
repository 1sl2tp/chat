from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'work-customer-summary.css').read_text('utf-8')

# Overview table is a flat data surface with header/list/footer hierarchy.
start=css.index('.work-summary-overview-grid{')
end=css.index('.work-summary-overview-grid-row{',start)
grid=css[start:end]
assert 'border-block:1px solid var(--theme-border-default);' in grid
assert 'border-inline:0;' in grid
assert 'border-radius:0;' in grid
assert 'border:1px solid var(--theme-border-default);' not in grid

# Only numbered customer rows scroll; header and total remain fixed siblings.
scroll=css[css.index('.work-summary-overview-list-scroll{'):css.index('.work-summary-customer{')]
assert 'overflow-y:auto;' in scroll
assert 'overscroll-behavior:contain;' in scroll
assert 'scrollbar-gutter:stable;' in scroll
assert '.work-summary-overview-head,\n.work-summary-overview-grand-total{\n  flex:0 0 auto;' in css

# Existing grid tracks remain explicit for readable STT/Tên/Mã/Sản phẩm alignment.
row=css[css.index('.work-summary-overview-grid-row{'):css.index('.work-summary-overview-head{')]
assert 'grid-template-columns:44px minmax(0,1fr) 64px 88px;' in row

print('V21.72.58 Region 3 overview table surface PASS')
