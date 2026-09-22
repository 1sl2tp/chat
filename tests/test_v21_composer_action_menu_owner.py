from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'app.js').read_text('utf-8')
admin=(ROOT/'admin-composer-actions.js').read_text('utf-8')
migration=(ROOT/'supabase/migrations/20260919060000_admin_credential_history_lookup.sql').read_text('utf-8')

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

for action,label in [
    ("quote","Báo giá"),
    ("debt","Công nợ"),
    ("stock-check","Kiểm hàng"),
    ("call-link","Link gọi"),
    ("credentials","Thông tin đăng nhập"),
]:
    assert f"action:'{action}',label:'{label}'" in admin
assert admin.count("actionButton({action:") == 5

assert "if(action==='stock-check')" in admin
assert "const links=await stockCheckLinks(contactId);" in admin
assert "links.owner_url" in admin
assert "Rà soát và cập nhật: " in admin
assert "try{return await openStockCheck(contactId);}" not in admin

assert "function parseCredentialMessage" in admin
assert "async function previousCredentialPassword" in admin
assert "window.V21CacheStore" in admin
assert "client.rpc('v21_admin_last_credential_message'" in admin
assert "p_app_session_id:String(auth.appSessionId)" in admin
assert "p_contact_id:String(contactId)" in admin
assert "cache.listMessages(admin.id,conversationId,1000)" in admin
assert "if(enteredPassword&&enteredPassword.length<6)" in admin
assert "Khách này chưa từng được gửi mật khẩu. Hãy nhập mật khẩu mới một lần." in admin
assert "Để trống = dùng mật khẩu cũ" in admin
assert "Gửi thông tin" in admin
assert "'Chat: https://chat.taphoa.xyz'" in admin
assert "'Mua hàng: https://app.taphoa.xyz'" in admin
assert "Đặt mật khẩu & gửi" not in admin
assert "security definer" in migration.lower()
assert "v21_private.require_active_account" in migration
assert "coalesce(v_role,'') <> 'admin'" in migration
assert "grant execute on function public.v21_admin_last_credential_message(uuid,uuid) to authenticated;" in migration

print('composer action menu single-owner positioning PASS')
