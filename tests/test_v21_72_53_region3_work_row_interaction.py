from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
js=(ROOT/'work-customer-summary.js').read_text('utf-8')
css=(ROOT/'work-customer-summary.css').read_text('utf-8')

def compact(value):
    return ''.join(value.split())

jc=compact(js)

# Overview customer rows are one interaction owner: the full row opens detail.
start=js.index('function renderOverviewRow(summary,index)')
end=js.index('function renderOverview(rows=[])',start)
row=js[start:end]
assert "node('button','work-summary-overview-row work-summary-customer work-summary-overview-grid-row')" in row
assert "card.type='button';" in row
assert 'card.dataset.workSummaryCustomer=customerId;' in row
assert "card.setAttribute('aria-label',`Mở công việc của ${customerName}`);" in row
assert "node('span','work-summary-overview-name',customerName)" in row
assert "node('button','work-summary-overview-name'" not in row

# Existing delegated click owner remains the single route into customer detail.
assert "constoverviewCustomer=event.target?.closest?.('[data-work-summary-customer]');" in jc
assert "openOverviewCustomer(overviewCustomer.getAttribute('data-work-summary-customer'));" in js

# ChatGPT-like row affordance: subtle hover/focus surface, no inner link styling.
assert '.work-summary-customer:hover{' in css
assert 'background:var(--theme-action-ghost-surface-hover);' in css
assert '.work-summary-customer:focus-visible{' in css
name=css[css.index('.work-summary-overview-name{'):css.index('.work-summary-overview-code,')]
assert 'border:' not in name
assert 'background:' not in name
assert 'cursor:pointer' not in name

print('V21.72.53 Region 3 work row interaction PASS')
