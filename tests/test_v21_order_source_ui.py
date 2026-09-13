from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'admin-order-source.js'
INDEX=ROOT/'index.source.html'
SHELL=ROOT/'shell.js'

assert SOURCE.exists(), 'admin-order-source.js must exist'
source=SOURCE.read_text(encoding='utf-8')
index=INDEX.read_text(encoding='utf-8')
shell=SHELL.read_text(encoding='utf-8')

for token in [
    'Hôm nay','Hôm qua','Tuần này','Tùy chọn','Hiện tất cả tin khách',
    'Bỏ qua','v21-order-source','V21AdminOrderSource',
    'adminOrderSourcePanel','adminOrderSourceScroll',
    'Khách:','tin phù hợp',
    'orderSplitPreviewEntries','previewEntries','Chưa tách ·',
    'customerOrderSourceGroup','data-source-order-group','splitGroup','ignoreGroup',
]:
    assert token in source, token

assert 'admin-order-source.js' in index
assert 'order-scribe-client.js' in index
assert 'data-top-tab="chat"' in index
assert 'data-top-tab="work"' in index
assert '[data-contact-row]' in source, 'open source panel must follow directory customer changes'
assert 'workThreadView' in shell

# Header/range stay fixed in the panel; only the summary preview owns vertical scrolling.
compact=''.join(source.split())
assert '#adminOrderSourcePanel{position:absolute;inset:0;' in compact
assert 'overflow:hidden' in compact
assert '.order-source-scroll{' in source
assert 'overflow-y:auto' in compact
assert '-webkit-overflow-scrolling:touch' in compact

# Desktop workspace still constrains the Chat-only panel to the middle Chat column.
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#adminOrderSourcePanel{' in compact
assert 'inset-inline-end:var(--desktop-work-width)' in compact

# A quick preview reads as one Chat summary: unresolved text is prepared by the
# core preview helper and rendered inline in the same result block.
assert 'helper.orderSplitPreviewEntries(splitResult)' in compact
assert 'entry.type===\'unresolved\'' in compact

# Chat-only semantics: every matching customer message in the selected time range
# is one raw summary, regardless of any legacy selling/imported state.
assert 'helper.customerOrderSourceGroup(rows)' in compact
assert 'selectedIds=newSet(orderGroup.sourceMessageIds)' not in compact
assert 'customerOrderSourceTimeline' not in source
assert 'timelineGroups' not in source
assert 'linkedExternalOrder' not in source
assert 'Đã tạo' not in source
assert 'Đã nhập' not in source
assert 'v21-work-context' not in source
assert 'markImported' not in source
assert 'Không có tin báo hàng phù hợp trong khoảng này.' in source
assert 'rows.map(row=>' not in compact, 'UI must not render one card per message anymore'

print('customer order source timeline UI contract PASS')
