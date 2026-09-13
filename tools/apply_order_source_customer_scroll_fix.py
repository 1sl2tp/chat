from pathlib import Path

root=Path(__file__).resolve().parents[1]
path=root/'admin-order-source.js'
text=path.read_text(encoding='utf-8')

replacements=[
(
'html[data-order-source-open="true"] #threadContent{min-height:0;height:100%;margin-bottom:0;padding-bottom:0}',
'html[data-order-source-open="true"] #threadContent{position:relative;min-height:0;height:100%;margin-bottom:0;padding-bottom:0;overflow:hidden}'
),
(
'#adminOrderSourcePanel{box-sizing:border-box;height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717)}',
'#adminOrderSourcePanel{position:absolute;inset:0;box-sizing:border-box;height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden;background:var(--theme-surface-primary,#fff);color:var(--theme-content-primary,#171717)}'
),
(
'.order-source-scroll{min-height:0;overflow:auto;padding:10px 12px 20px;display:grid;align-content:start;gap:8px;overscroll-behavior:contain}',
'.order-source-scroll{min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px 12px 20px;display:grid;align-content:start;gap:8px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}'
),
(
"if(customer)customer.textContent=contact?contact.name:'Chưa chọn khách';",
"if(customer)customer.textContent=contact?`Khách: ${contact.name}`:'Chưa chọn khách';"
),
]

for old,new in replacements:
    if old not in text:
        raise SystemExit(f'anchor not found: {old[:80]}')
    text=text.replace(old,new,1)

path.write_text(text,encoding='utf-8')
print('order source customer/scroll fix applied')
