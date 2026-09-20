from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'work-customer-summary.js').read_text('utf-8')
css=(ROOT/'work-customer-summary.css').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

jc=compact(js)
cc=compact(css)

# Detail completion remains checkbox-owned; the hit target is enlarged without making the whole row destructive.
assert "const toggle=node('button','work-summary-check');" in js
assert "toggle.setAttribute('role','checkbox');" in js
assert "toggle.dataset.workItemToggle='true';" in js
assert "li.dataset.workItemToggle" not in js
assert '--work-summary-check-size:36px' in css
assert 'grid-template-columns:var(--work-summary-check-size)minmax(0,1fr)' in cc
assert '@media(hover:none),(pointer:coarse)' in cc
assert '--work-summary-check-size:44px' in css

# Busy state is visible and prevents duplicate taps while the backend mutation is in flight.
assert 'constbusy=completionBusy.has(busyKey);' in jc
assert "toggle.setAttribute('aria-busy',String(busy));" in js
assert 'toggle.disabled=busy;' in js
assert 'functionsyncCompletionControlBusy(customerId,itemKey,busy)' in jc
assert 'syncCompletionControlBusy(customerId,itemKey,true);' in js
assert 'syncCompletionControlBusy(customerId,itemKey,false);' in js

# ChatGPT/taste-skill interaction states: hover, pressed, focus and checked are explicit.
assert '.work-summary-check:hover{' in css
assert '.work-summary-check:active:not(:disabled){' in css
assert '.work-summary-check:focus-visible{' in css
assert '.work-summary-check[aria-checked="true"]{' in css
assert 'background:var(--blue-400);' in css

print('V21.72.55 Region 3 detail check control PASS')
