from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

migration = ROOT / 'supabase/migrations/20260915_customer_summary_scan.sql'
edge = ROOT / 'supabase/functions/v21-customer-summary-scan/index.ts'
client = ROOT / 'customer-summary-client.js'
source = ROOT / 'index.source.html'

assert migration.exists(), 'customer summary scan migration is missing'
assert edge.exists(), 'customer summary scan edge function is missing'
assert client.exists(), 'customer summary work-view client is missing'

m = migration.read_text('utf-8')
e = edge.read_text('utf-8')
c = client.read_text('utf-8')
s = source.read_text('utf-8')

# Every minute, but no more than 15 customers per run.
assert "'* * * * *'" in m or "'* * * * *'," in m, 'scan must run once per minute'
assert '15' in m, 'database batch contract must cap at 15 customers'
assert 'LIMIT 15' in m.upper() or 'least(15' in m.lower(), 'eligible batch must be capped at 15 customers'

# A customer without their own message must never consume an API slot.
assert 'sender_account_id = a.id' in m or 'sender_account_id=a.id' in m, 'eligibility must require at least one customer-authored message'

# The AI input must contain customer-authored content only and load the whole history.
assert ".eq('sender_account_id',contactId)" in e.replace(' ', ''), 'scan must filter strictly by customer sender id'
assert 'PAGE_SIZE' in e and '.range(' in e, 'full customer history must be paged rather than truncated to a recent window'
assert 'admin' not in e.lower().split('async function loadcustomermessages',1)[-1].split('async function',1)[0], 'customer message loader must not mix Admin content'

# Work view shows numbered lines and a total for each customer result.
assert 'data-customer-summary-root' in s, 'Work view must own the customer summary root'
assert 'customer-summary-client.js' in s, 'customer summary client must be loaded by the app source'
assert 'customer-summary-index' in c, 'rendered item rows must include an explicit STT cell'
assert 'Tổng' in c, 'rendered customer summary must include a total footer'

print('Customer summary scan contract PASS')
