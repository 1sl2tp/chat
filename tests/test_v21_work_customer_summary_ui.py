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
compact_s = ''.join(s.split())

assert 'data-work-summary-root' in index_source, 'Công việc needs a dedicated summary root'
assert 'work-customer-summary.css' in index_source, 'summary stylesheet must be part of the canonical build'
assert 'work-customer-summary.js' in index_source, 'summary client must be part of the canonical build'

assert "rpc('chat_customer_summary_work_feed'" in c or 'rpc("chat_customer_summary_work_feed"' in c, 'client must read the secure summary feed RPC'
assert 'V21AuthSessionStore' in c and 'getClient' in c, 'client must reuse the authenticated Supabase session'
assert 'v21-auth-state' in c, 'summary view must react to login/logout state'
assert 'setInterval' in c or 'setTimeout' in c, 'summary view must refresh automatically'
assert 'rawEvidence' in c, 'uncertain/inferred lines must keep original evidence visible'
assert 'totalLines' in c and 'totals' in c, 'view must show line count and totals'
assert "node('ol'" in c or 'node("ol"' in c or "createElement('ol')" in c or 'createElement("ol")' in c, 'items must render with visible STT ordering'

lower_m = m.lower()
assert 'chat_customer_summary_work_feed' in lower_m, 'migration must define the feed RPC'
assert 'auth.uid()' in lower_m, 'feed RPC must bind access to the signed-in user'
assert "role='admin'" in lower_m.replace(' ', '') or "role = 'admin'" in lower_m, 'feed RPC must be admin-only'
assert 'grant execute' in lower_m and 'authenticated' in lower_m, 'feed RPC must only be callable through authenticated role'

assert '.work-summary-customer' in s, 'customer summary card styling is missing'
assert '.work-summary-item' in s, 'summary item styling is missing'

# Detail density contract: back/all + customer + remaining counts share one row.
assert '.work-summary-detail-header .work-summary-header-title' in s, 'detail header needs a dedicated one-line title owner'
assert 'flex-direction:row' in compact_s, 'detail title + counts must stay on one horizontal line'
assert 'align-items:baseline' in compact_s or 'align-items:center' in compact_s, 'detail one-line header needs vertical alignment'

# Every product row is one physical line: STT + checkbox + name + quantity.
assert '.work-summary-item-name' in s and 'white-space:nowrap' in compact_s, 'product names must not wrap to a second line'
assert 'text-overflow:ellipsis' in compact_s, 'long product names must ellipsize instead of wrapping'
assert '.work-summary-item-main' in s and 'grid-template-columns:minmax(0,1fr)auto' in compact_s, 'name and quantity must remain one row'

# Zebra rhythm must be subtle and automatic without changing completed-state semantics.
assert '.work-summary-item:nth-child(even)' in s, 'detail rows need alternating background rhythm'
assert 'color-mix(' in s, 'alternating rows must use a subtle mixed surface color'

print('Work customer summary UI contract PASS')
