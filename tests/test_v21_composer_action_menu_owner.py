from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
admin=(ROOT/'admin-composer-actions.js').read_text('utf-8')

assert 'window.V21ComposerActionMenu=Object.freeze' in app
assert 'place:placeComposerActionMenu' in app
assert 'open:()=>setComposerActionMenuOpen(true)' in app
assert 'close:()=>setComposerActionMenuOpen(false)' in app
assert "rect.top-menuHeight-8" in app

assert "event.stopImmediatePropagation()" not in admin
assert "function showMenu()" not in admin
assert "menu.showPopover" not in admin
assert "window.V21ComposerActionMenu" in admin
assert "owner?.close" in admin
assert "ensureAdminMenu();" in admin

print('composer action menu single-owner positioning PASS')
