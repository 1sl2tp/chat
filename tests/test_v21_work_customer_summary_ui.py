from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

index_source = (ROOT / 'index.source.html').read_text('utf-8')
client = ROOT / 'work-customer-summary.js'
style = ROOT / 'work-customer-summary.css'
migration = ROOT / 'supabase/migrations/20260915_customer_summary_work_feed.sql'

assert client.exists(), 'work customer summary client is missing'
assert style.exists(), 'work customer summary stylesheet is missing'
assert migration.exists(), 'customer summary work-feed migration is missing'

c = client.read_text('utf-8')
s = style.read_text('utf-8')
m = migration.read_text('utf-8')

assert 'data-work-summary-root' in index_source, 'Công việc needs a dedicated summary root'
assert 'work-customer-summary.css' in index_source, 'summary stylesheet must be part of the canonical build'
assert 'work-customer-summary.js' in index_source, 'summary client must be part of the canonical build'

assert "rpc('chat_customer_summary_work_feed'" in c or 'rpc("chat_customer_summary_work_feed"' in c, 'client must read the secure summary feed RPC'
assert 'V21AuthSessionStore' in c and 'getClient' in c, 'client must reuse the authenticated Supabase session'
assert 'v21-auth-state' in c, 'summary view must react to login/logout state'
assert 'setInterval' in c or 'setTimeout' in c, 'summary view must refresh automatically'
assert 'rawEvidence' in c, 'uncertain/inferred lines must keep original evidence visible'
assert 'totalLines' in c and 'totals' in c, 'view must show line count and totals'
assert '<ol' in c or 'createElement(\'ol\')' in c or 'createElement("ol")' in c, 'items must render with visible STT ordering'

lower_m = m.lower()
assert 'chat_customer_summary_work_feed' in lower_m, 'migration must define the feed RPC'
assert 'auth.uid()' in lower_m, 'feed RPC must bind access to the signed-in user'
assert "role='admin'" in lower_m.replace(' ', '') or "role = 'admin'" in lower_m, 'feed RPC must be admin-only'
assert 'grant execute' in lower_m and 'authenticated' in lower_m, 'feed RPC must only be callable through authenticated role'

assert '.work-summary-customer' in s, 'customer summary card styling is missing'
assert '.work-summary-item' in s, 'summary item styling is missing'

print('Work customer summary UI contract PASS')
