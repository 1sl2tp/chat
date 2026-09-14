from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / 'work-customer-summary.js'
STYLE = ROOT / 'work-customer-summary.css'
MIGRATION = ROOT / 'supabase/migrations/20260915_customer_summary_completion.sql'

c = CLIENT.read_text('utf-8')
s = STYLE.read_text('utf-8')

# Aggregate mode: only customers with at least one complete quantity + name line.
assert 'validSummaryItems' in c, 'aggregate view must filter to items with both name and quantity'
assert 'summaryProductCount' in c, 'aggregate total must sum raw quantities regardless of unit'

# Overview must be a readable table: STT | Tên | Mã | Sản phẩm + Tổng footer.
assert 'work-summary-overview-head' in c, 'overview needs an explicit column header row'
assert "'STT'" in c and "'Tên'" in c and "'Mã'" in c and "'Sản phẩm'" in c, 'overview columns must be STT/Tên/Mã/Sản phẩm'
assert 'work-summary-overview-index' in c, 'each overview customer row needs an STT cell'
assert 'work-summary-overview-grand-total' in c, 'overview needs a final Tổng row'
assert 'Tổng' in c, 'overview total row must be labelled Tổng'
assert '.work-summary-overview-grid' in s, 'overview table needs a stable grid geometry'
assert 'grid-template-columns' in s, 'overview columns must use explicit grid tracks'

# Overview geometry: Tổng hợp/header, column header, and Tổng footer stay fixed.
# Only the numbered customer rows are allowed to scroll.
assert 'work-summary-overview-list-scroll' in c, 'overview needs a dedicated scroll owner for numbered customer rows'
assert '.work-summary-overview-list-scroll' in s, 'overview customer-row scroller needs dedicated geometry'
assert 'overflow-y:auto' in s.replace(' ', ''), 'customer-row scroller must own vertical scrolling'
assert '.work-summary-overview{\n  display:block;\n  overflow:hidden;' in s, 'overview body itself must not scroll'

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

# Detail totals are remaining work only, not the original full order.
assert 'remainingRecords' in c, 'detail header must derive totals from incomplete records'
assert 'remainingProductCount' in c, 'detail header must sum only incomplete quantities'

# Completing an item must not throw the operator back to the top.
assert 'captureDetailScroll' in c, 'completion must capture the current detail scroll position'
assert 'restoreDetailScroll' in c, 'completion must restore the working viewport after reorder'
assert 'scrollTop' in c, 'detail scroll position must be preserved explicitly'

# The tapped row needs visible acknowledgement before/while it moves to completed.
assert 'is-just-updated' in c, 'runtime must tag the just-toggled item for feedback'
assert '.work-summary-item.is-just-updated' in s, 'just-toggled item needs a visual feedback state'

# Completion state is persistent and admin-scoped in Supabase.
assert MIGRATION.exists(), 'completion persistence migration is missing'
m = MIGRATION.read_text('utf-8').lower()
assert 'chat_customer_summary_completion' in m, 'completion table is required'
assert 'chat_customer_summary_set_completed' in m, 'completion toggle RPC is required'
assert 'completed_item_keys' in m, 'work feed must return completed keys for each customer'
assert 'auth.uid()' in m and "role = 'admin'" in m, 'completion mutations must be admin-only'

print('Work customer summary reconcile contract PASS')
