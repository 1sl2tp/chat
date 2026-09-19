from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
admin=(ROOT/'admin-composer-actions.js').read_text('utf-8')

assert 'window.V21ComposerActionMenu=Object.freeze' in app
assert 'place:placeComposerActionMenu' in app
assert 'open:()=>setComposerActionMenuOpen(true)' in app
assert 'close:()=>setComposerActionMenuOpen(false)' in app
assert "rect.top-menuHeight-8" in app
assert "function hasAppOwnedComposerActions()" in app
assert "RuntimeProfile.pickerMode==='ios-native'&&!hasAppOwnedComposerActions()" in app

assert "event.stopImmediatePropagation()" not in admin
assert "function showMenu()" not in admin
assert "menu.showPopover" not in admin
assert "window.V21ComposerActionMenu" in admin
assert "owner?.close" in admin
assert "ensureAdminMenu();" in admin

assert "function parseCredentialMessage" in admin
assert "async function previousCredentialPassword" in admin
assert "window.V21CacheStore" in admin
assert "cache.listMessages(admin.id,conversationId,1000)" in admin
assert "if(enteredPassword&&enteredPassword.length<6)" in admin
assert "Chưa có mật khẩu cũ đã gửi. Hãy nhập mật khẩu mới." in admin
assert "Để trống = dùng mật khẩu cũ" in admin
assert "Gửi thông tin" in admin
assert "'Chat: https://chat.taphoa.xyz'" in admin
assert "'Mua hàng: https://app.taphoa.xyz'" in admin
assert "Đặt mật khẩu & gửi" not in admin

print('composer action menu single-owner positioning PASS')
