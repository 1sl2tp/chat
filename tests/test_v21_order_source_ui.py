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
    'Chưa xử lý','Đang xử lý','Đã nhập','Bỏ qua','Đã tạo',
    'v21-order-source','v21-work-context','V21AdminOrderSource',
    'adminOrderSourcePanel','adminOrderSourceScroll',
    'Khách:',
    'orderSplitPreviewEntries','previewEntries','Chưa tách ·',
    'customerOrderSourceGroup','customerOrderSourceTimeline','timelineGroups',
    'data-source-order-group','splitGroup','ignoreGroup','linkedExternalOrderNo',
]:
    assert token in source, token

assert 'admin-order-source.js' in index
assert 'order-scribe-client.js' in index
assert 'data-top-tab="chat"' in index
assert 'data-top-tab="work"' in index
assert '[data-contact-row]' in source, 'open source panel must follow directory customer changes'
assert 'selectedIds.clear()' in source
assert 'workThreadView' in shell

# Header/range stay fixed in the panel; only the order preview owns vertical scrolling.
compact=''.join(source.split())
assert '#adminOrderSourcePanel{position:absolute;inset:0;' in compact
assert 'overflow:hidden' in compact
assert '.order-source-scroll{' in source
assert 'overflow-y:auto' in compact
assert '-webkit-overflow-scrolling:touch' in compact

# Desktop workspace gives threadContent a large right padding for the Work column.
# The absolute order-source overlay must therefore explicitly stop at that same
# Work boundary instead of laying itself out at the full stage width and getting clipped.
assert '#appShell[data-auth-state="authenticated"][data-desktop-workspace="true"]#adminOrderSourcePanel{' in compact
assert 'inset-inline-end:var(--desktop-work-width)' in compact

# A quick preview reads as one order summary: unresolved text is prepared by the
# core preview-order helper and rendered inline in the same result block.
assert 'helper.orderSplitPreviewEntries(splitResult)' in compact
assert 'entry.type===\'unresolved\'' in compact

# Timeline semantics: active messages form the current order/context, while imported
# orders stay visible as time-based history instead of disappearing after creation.
assert 'helper.customerOrderSourceTimeline(rows)' in compact
assert 'timelineGroups.find(group=>group.state!==\'imported\')' in compact
assert 'selectedIds=newSet(orderGroup.sourceMessageIds)' in compact
assert 'group.state===\'imported\'' in compact
assert 'group.linkedExternalOrderNo' in source
assert 'Không có tin đơn hàng trong khoảng này.' in source
assert 'Không còn tin đơn hàng chưa tạo trong khoảng này.' not in source
assert 'rows.map(row=>' not in compact, 'UI must not render one card per message anymore'

print('customer order source timeline UI contract PASS')