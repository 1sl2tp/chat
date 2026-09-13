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
    'Chưa xử lý','Đang xử lý','Đã nhập','Bỏ qua',
    'v21-order-source','v21-work-context','V21AdminOrderSource',
    'adminOrderSourcePanel','adminOrderSourceScroll',
]:
    assert token in source, token

assert 'admin-order-source.js' in index
assert 'order-scribe-client.js' in index
assert 'data-top-tab="chat"' in index
assert 'data-top-tab="work"' in index
assert 'v21-active-contact-change' in source
assert 'workThreadView' in shell

print('customer order source timeline UI contract PASS')
