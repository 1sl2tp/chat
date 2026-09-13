from pathlib import Path

root=Path(__file__).resolve().parents[1]
path=root/'index.source.html'
text=path.read_text(encoding='utf-8')
needle='<script src="./app.js" data-build-source="app.js"></script>'
insert='''<script src="./order-scribe-client.js" data-build-source="order-scribe-client.js"></script>\n<script src="./admin-order-source.js" data-build-source="admin-order-source.js"></script>\n'''+needle
if 'admin-order-source.js' not in text:
    if needle not in text:
        raise SystemExit('app script anchor not found')
    text=text.replace(needle,insert,1)
path.write_text(text,encoding='utf-8')
print('order source UI scripts inserted')
