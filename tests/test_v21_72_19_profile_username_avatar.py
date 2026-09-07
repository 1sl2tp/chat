from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def read(path):
    p=ROOT/path
    assert p.exists(), f"missing {path}"
    return p.read_text('utf-8')

shell=read('shell.js')
assert 'data-profile-username' in shell
assert 'autocomplete="username"' in shell
assert 'maxlength="24"' in shell
assert 'username:usernameInput.value' in shell
assert "usernameInput.value=String(model.username||'')" in shell
assert "invalid_username" in shell or "Tên đăng nhập" in shell

assert 'data-password-toggle' in shell
assert 'shell-profile-field' in shell
assert "selfMode?'Đổi thông tin'" in shell
assert 'setProfileInvalid' in shell
assert 'clearProfileValidation' in shell
assert 'markProfileResultError' in shell
assert "input.setAttribute('aria-invalid','true')" in shell

auth=read('auth-session-store.js')
assert "async function updateSelf({username,displayName,password='',avatarFile=null}={})" in auth
self_start=auth.index("async function updateSelf(")
self_end=auth.index("async function invokeAdmin",self_start)
self_body=auth[self_start:self_end]
assert "client.functions.invoke('v21-account-self'" in self_body
assert "app_session_id:appSessionId" in self_body
assert "username:" in self_body
assert "v21_account_update_self" not in self_body
assert "AVATAR_TYPES" in auth
assert "image/png" in auth and "image/jpeg" in auth and "image/webp" in auth
assert "async function adminSaveUser({targetAccountId,username,displayName,password='',avatarFile=null}={})" in auth
admin_start=auth.index("async function adminSaveUser(")
admin_end=auth.index("async function adminSetLocked",admin_start)
admin_body=auth[admin_start:admin_end]
assert "username:String(username||'')" in admin_body

source=read('index.source.html')
assert '.shell-profile-field input[aria-invalid="true"]' in source
assert '.shell-profile-field:has(input[aria-invalid="true"])>label{color:#e11900}' in source
assert '.shell-profile-overlay[data-mobile-keyboard="true"]' in source
avatar_start=source.index('.contact-avatar-source{')
avatar_end=source.index('}',avatar_start)
avatar_css=source[avatar_start:avatar_end]
assert 'overflow:hidden' in avatar_css
assert 'border-radius:50%' in avatar_css
assert 'aspect-ratio:1 / 1' in avatar_css
assert 'max-width:48px' in avatar_css
assert 'max-height:48px' in avatar_css
assert 'flex:0 0 48px' in avatar_css

profile_start=source.index('.shell-profile-avatar{')
profile_end=source.index('}',profile_start)
profile_css=source[profile_start:profile_end]
assert 'overflow:hidden' in profile_css
assert 'border-radius:50%' in profile_css
assert 'flex:0 0 64px' in profile_css
assert 'max-width:64px' in profile_css
assert 'max-height:64px' in profile_css
assert 'aspect-ratio:1 / 1' in profile_css

image_start=source.index('.shell-avatar-image{')
image_end=source.index('}',image_start)
image_css=source[image_start:image_end]
assert 'object-fit:cover!important' in image_css
assert 'object-position:center!important' in image_css
assert 'aspect-ratio:1 / 1' in image_css
assert 'border-radius:50%' in image_css

render_start=shell.index('function renderAvatarInitials(')
render_end=shell.index('function compactPreview',render_start)
render=shell[render_start:render_end]
assert "img.addEventListener('error'" in render
assert "node.textContent=initialsFor" in render

self_edge=read('supabase/functions/v21-account-self/index.ts')
for token in [
    'v21_sessions',
    'app_session_id',
    'username_taken',
    '^[a-z0-9_]{3,24}$',
    'admin.auth.admin.updateUserById',
    'patch.email_confirm = true',
    'rollback',
    'v21_accounts'
]:
    assert token in self_edge, token

admin_edge=read('supabase/functions/v21-account-admin/index.ts')
for token in [
    'username_taken',
    '^[a-z0-9_]{3,24}$',
    'admin.auth.admin.updateUserById',
    'patch.email_confirm = true',
    'rollback'
]:
    assert token in admin_edge, token

print('V21.72.26 profile username/avatar contract PASS')
