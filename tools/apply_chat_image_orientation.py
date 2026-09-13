from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
# This helper is intentionally branch-only and is removed before merge.


def replace_once(path,old,new,label):
    text=path.read_text(encoding='utf-8')
    count=text.count(old)
    if count==0:
        if new in text:
            return False
        raise AssertionError(f'{label}: source anchor missing')
    if count!=1:
        raise AssertionError(f'{label}: expected 1 anchor, found {count}')
    path.write_text(text.replace(old,new,1),encoding='utf-8')
    return True

app=ROOT/'app.js'
replace_once(
    app,
    "const lease=InteractionController.enter(InteractionMode.IMAGE_VIEWER,{\n    owner:'image-viewer',\n    lockBaseUi:true\n  });",
    "const lease=InteractionController.enter(InteractionMode.IMAGE_VIEWER,{\n    owner:'image-viewer',\n    lockBaseUi:false\n  });",
    'image viewer interaction lock',
)
replace_once(
    app,
    "const host=document.getElementById('activeScreenSlot')||document.getElementById('chatScreen');",
    "const host=stageLayout||document.getElementById('threadContent');",
    'image viewer desktop geometry owner',
)

index=ROOT/'index.source.html'
marker='<script src="./app.js" data-build-source="app.js"></script>'
loader='<script src="./chat-image-orientation.js" data-build-source="chat-image-orientation.js"></script>'
text=index.read_text(encoding='utf-8')
if loader not in text:
    if text.count(marker)!=1:
        raise AssertionError('app.js script anchor missing or duplicated')
    text=text.replace(marker,marker+'\n'+loader,1)
    index.write_text(text,encoding='utf-8')

core=ROOT/'order-source-core.mjs'
core_text=core.read_text(encoding='utf-8')
core_text=core_text.replace("import './order-source-image-viewer.js';\n\n",'',1)
core_text=core_text.replace("  if(typeof globalThis!=='undefined')globalThis.__V21LastOrderSourceGroup=result;\n",'',1)
core.write_text(core_text,encoding='utf-8')

for obsolete in [ROOT/'order-source-image-viewer.js',ROOT/'tests/test_v21_order_source_inline_image_viewer.py']:
    if obsolete.exists():
        obsolete.unlink()

print('chat image orientation patch applied')
