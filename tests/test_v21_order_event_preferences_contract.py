from pathlib import Path
r=Path(__file__).resolve().parents[1]
src=(r/'customer-notification-settings.js').read_text('utf-8')
html=(r/'index.html').read_text('utf-8')
assert "['order','Tạo đơn" in src
assert "['order_edit','Sửa đơn" in src
assert "['collection','Thu tiền" in src
assert "['debt','Ghi nợ" in src
assert "data-inlined-source=\"customer-notification-settings.js\"" in html
assert "['order_edit','Sửa đơn" in html
