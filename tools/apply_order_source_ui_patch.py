from pathlib import Path

root=Path(__file__).resolve().parents[1]

index_path=root/'index.source.html'
text=index_path.read_text(encoding='utf-8')
needle='<script src="./app.js" data-build-source="app.js"></script>'
insert='''<script src="./order-scribe-client.js" data-build-source="order-scribe-client.js"></script>\n<script src="./admin-order-source.js" data-build-source="admin-order-source.js"></script>\n'''+needle
if 'admin-order-source.js' not in text:
    if needle not in text:
        raise SystemExit('app script anchor not found')
    text=text.replace(needle,insert,1)
index_path.write_text(text,encoding='utf-8')

composer_path=root/'admin-composer-actions.js'
composer=composer_path.read_text(encoding='utf-8')
old="""  if(action==='create'){
    try{return await openOrder(contactId);}catch{setTransientHint('Không thể mở tạo đơn');return false;}
  }
"""
new="""  if(action==='create'){
    try{
      const source=window.V21AdminOrderSource;
      if(!source?.open)throw new Error('order_source_unavailable');
      return await source.open({preset:'today'});
    }catch{setTransientHint('Không thể mở tin báo hàng',2600);return false;}
  }
"""
if old in composer:
    composer=composer.replace(old,new,1)
elif "source.open({preset:'today'})" not in composer:
    raise SystemExit('create-order action anchor not found')
composer_path.write_text(composer,encoding='utf-8')

print('order source UI patch applied')
