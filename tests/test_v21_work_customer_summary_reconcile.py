from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / 'work-customer-summary.js'
STYLE = ROOT / 'work-customer-summary.css'
MIGRATION = ROOT / 'supabase/migrations/20260915_customer_summary_completion.sql'

c = CLIENT.read_text('utf-8')
s = STYLE.read_text('utf-8')

# Aggregate mode: only customers with at least one complete quantity + name line,
# and the compact second line is strictly "N mã · M sản phẩm" with units ignored.
assert 'validSummaryItems' in c, 'aggregate view must filter to items with both name and quantity'
assert 'mã' in c and 'sản phẩm' in c, 'aggregate card must show compact code/product totals'
assert 'summaryProductCount' in c, 'aggregate total must sum raw quantities regardless of unit'
assert 'work-summary-overview-row' in s, 'aggregate rows need a dedicated compact two-line layout'

# Selecting a chat contact switches Work to that customer; Tất cả returns to overview.
assert 'v21-active-contact-change' in c, 'Work must react to the selected customer'
assert 'renderCustomerDetail' in c, 'selected-customer reconciliation view is required'
assert 'data-work-summary-all' in c, 'detail view needs a Tất cả control'

# Reconciliation: checkbox/toggle, completed rows last, muted + struck through.
assert 'chat_customer_summary_set_completed' in c, 'completion must persist through the backend RPC'
assert 'data-work-item-toggle' in c, 'each detail item needs a completion control'
assert 'sortItemsForReconcile' in c, 'completed rows must sort below incomplete rows'
assert '.work-summary-item.is-completed' in s, 'completed rows need a muted/struck visual state'
assert 'text-decoration:line-through' in s.replace(' ', ''), 'completed text must be struck through'

# Completion state is persistent and admin-scoped in Supabase.
assert MIGRATION.exists(), 'completion persistence migration is missing'
m = MIGRATION.read_text('utf-8').lower()
assert 'chat_customer_summary_completion' in m, 'completion table is required'
assert 'chat_customer_summary_set_completed' in m, 'completion toggle RPC is required'
assert 'completed_item_keys' in m, 'work feed must return completed keys for each customer'
assert 'auth.uid()' in m and "role = 'admin'" in m, 'completion mutations must be admin-only'

print('Work customer summary reconcile contract PASS')
