from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/"index.source.html").read_text("utf-8")
app=(ROOT/"app.js").read_text("utf-8")

def compact(value):
    return "".join(value.split())

source_c=compact(source)
app_c=compact(app)

# Region 2 owns header + conversation scroll + composer; responsive columns stay outside.
assert "Region2ownermap:Header/conversationscrollowner/Composer." in source_c
assert "#stageLayout{position:relative;box-sizing:border-box;min-width:0;min-height:0;}" in source_c
assert 'id="scrollRoot"' in source
assert 'id="thread-bottom-container"' in source

# The + control advertises the menu relationship and mirrors open state.
assert 'id="composer-plus-btn"' in source
assert 'aria-haspopup="menu"' in source
assert 'aria-controls="composerActionMenu"' in source
assert 'aria-expanded="false"' in source
assert "functionsyncComposerActionMenuTrigger()" in app_c
assert "plusButton.setAttribute('aria-expanded',String(open))" in app_c

# Native popover owns light-dismiss. Fallback keeps the same outside/Escape contract.
assert "if(supportsPopoverApi||!isComposerActionMenuOpen())return;" in app_c
assert "if(actionMenu.contains(target)||plusButton.contains(target))return;" in app_c
assert "setComposerActionMenuOpen(false);" in app
assert "if(supportsPopoverApi||event.key!=='Escape'||!isComposerActionMenuOpen())return;" in app_c
assert "plusButton.focus({preventScroll:true})" in app_c

print("V21.72.49 Region 2 composer menu contract PASS")
