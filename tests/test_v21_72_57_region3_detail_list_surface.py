from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'work-customer-summary.css').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

cc=compact(css)

# Region 3 detail rows live on one flat surface; the list is not a nested rounded card.
start=css.index('.work-summary-list{')
end=css.index('.work-summary-item{',start)
block=css[start:end]
assert 'border-block:1px solid var(--theme-border-default);' in block
assert 'border-inline:0;' in block
assert 'border-radius:0;' in block
assert 'overflow:visible;' in block
assert 'background:transparent;' in block
assert 'border:1px solid var(--theme-border-default);' not in block

# Row separators remain the internal hierarchy owner.
assert '.work-summary-item+.work-summary-item{' in css
assert 'border-top:1px solid color-mix(' in css

# Dense one-line row contract remains locked.
assert '.work-summary-item-name{' in css
assert 'white-space:nowrap;' in css
assert '.work-summary-item-main{' in css
assert 'grid-template-columns:minmax(0,1fr) auto;' in css

print('V21.72.57 Region 3 detail list surface PASS')
